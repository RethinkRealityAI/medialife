import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createShelfFn, shelfSlugCheckFn } from "@/lib/shelf/shelves.functions";
import {
  cleanShelfSlugInput,
  isValidShelfSlug,
  shelfSlugify,
  type ShelfSummary,
} from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

// "New shelf": the creator's name (on the sign), a label for the team, the link,
// and whether to start from the default shelf or copy one already made.

export function NewShelfDialog({
  open,
  onOpenChange,
  shelves,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  shelves: ShelfSummary[];
}) {
  const navigate = useNavigate();
  const [creator, setCreator] = useState("");
  const [label, setLabel] = useState("");
  const [labelTouched, setLabelTouched] = useState(false);
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [from, setFrom] = useState<string>("default");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [check, setCheck] = useState<{ state: "idle" | "checking" | "ok" | "bad"; msg?: string }>({
    state: "idle",
  });

  useEffect(() => {
    if (!open) return;
    setCreator("");
    setLabel("");
    setLabelTouched(false);
    setSlug("");
    setSlugTouched(false);
    setFrom("default");
    setError(null);
    setCheck({ state: "idle" });
  }, [open]);

  // availability, debounced
  useEffect(() => {
    if (!slug) return setCheck({ state: "idle" });
    if (!isValidShelfSlug(slug)) {
      return setCheck({
        state: "bad",
        msg: /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/.test(slug)
          ? "That word is reserved. Try another."
          : "2–40 lowercase letters, numbers and dashes.",
      });
    }
    setCheck({ state: "checking" });
    let live = true;
    const t = setTimeout(async () => {
      try {
        const r = await shelfSlugCheckFn({ data: { slug } });
        if (!live) return;
        setCheck(r.available ? { state: "ok" } : { state: "bad", msg: r.reason ?? "Taken" });
      } catch {
        if (live) setCheck({ state: "idle" });
      }
    }, 350);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [slug]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await createShelfFn({
        data: {
          slug,
          name: label.trim() || creator.trim() || slug,
          creator: creator.trim() || undefined,
          from: from === "default" ? null : from,
        },
      });
      if (!r.ok) {
        setError(
          r.error === "taken"
            ? "That link is taken. Try another."
            : r.error === "bad-slug"
              ? "Use 2–40 lowercase letters, numbers and dashes."
              : "The shelf to copy no longer exists.",
        );
        return;
      }
      toast.success("Shelf created");
      onOpenChange(false);
      await navigate({ to: "/admin/shelves/$slug", params: { slug: r.slug } });
    } catch {
      setError("Couldn't create the shelf. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const slugMsg =
    check.state === "bad"
      ? { tone: "err", text: check.msg }
      : check.state === "ok"
        ? { tone: "ok", text: "Available" }
        : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New merch shelf</DialogTitle>
            <DialogDescription>
              A 3D merch shop made for one creator. You'll set the logo, colours and products next,
              with a live preview.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="ns-creator" className="mb-1.5 block text-xs font-medium">
                Creator name{" "}
                <span className="font-normal text-muted-foreground">(on the sign)</span>
              </label>
              <Input
                id="ns-creator"
                autoFocus
                value={creator}
                maxLength={28}
                placeholder="PixelPine"
                onChange={(e) => {
                  const v = e.target.value;
                  setCreator(v);
                  if (!slugTouched) setSlug(shelfSlugify(v));
                  if (!labelTouched) setLabel(v.trim() ? `${v.trim()} pitch` : "");
                }}
              />
            </div>
            <div>
              <label htmlFor="ns-label" className="mb-1.5 block text-xs font-medium">
                Label
              </label>
              <Input
                id="ns-label"
                value={label}
                maxLength={80}
                placeholder="PixelPine · Snowday outreach"
                onChange={(e) => {
                  setLabelTouched(true);
                  setLabel(e.target.value);
                }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                For the team. Creators don't see it.
              </p>
            </div>
            <div>
              <label htmlFor="ns-slug" className="mb-1.5 block text-xs font-medium">
                Link
              </label>
              <div className="relative">
                <span className="mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
                  /shelf/
                </span>
                <Input
                  id="ns-slug"
                  value={slug}
                  spellCheck={false}
                  aria-invalid={check.state === "bad"}
                  aria-describedby="ns-slug-msg"
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(cleanShelfSlugInput(e.target.value));
                  }}
                  className="mono pl-[60px] text-xs aria-[invalid=true]:border-destructive/70"
                />
                {check.state === "checking" ? (
                  <Loader2
                    className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : check.state === "ok" ? (
                  <Check
                    className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 text-emerald-400"
                    aria-hidden
                  />
                ) : null}
              </div>
              <p
                id="ns-slug-msg"
                className={cn(
                  "mt-1.5 text-xs",
                  slugMsg?.tone === "err"
                    ? "text-destructive"
                    : slugMsg?.tone === "ok"
                      ? "text-emerald-400"
                      : "text-muted-foreground",
                )}
              >
                {slugMsg?.text ?? "You can change it until you publish."}
              </p>
            </div>
            <div>
              <label htmlFor="ns-from" className="mb-1.5 block text-xs font-medium">
                Start from
              </label>
              <Select value={from} onValueChange={setFrom}>
                <SelectTrigger id="ns-from">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">The default shelf (MEDIALIFE lineup)</SelectItem>
                  {shelves.map((s) => (
                    <SelectItem key={s.slug} value={s.slug}>
                      Copy of {s.creator} · {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {from !== "default" ? (
                <p className="mt-1.5 text-xs text-muted-foreground">
                  Copies its logo, products, theme and pitch, with the new name on the sign.
                </p>
              ) : null}
            </div>
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0 pointer-coarse:[&_:is(button,a)]:h-11">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !creator.trim() || check.state !== "ok"}>
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Creating…" : "Create shelf"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
