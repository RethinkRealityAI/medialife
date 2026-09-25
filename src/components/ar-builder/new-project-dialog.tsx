import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { createProjectFn, slugAvailableFn } from "@/lib/ar/projects.functions";
import {
  TEMPLATES,
  cleanSlugInput,
  isValidSlug,
  slugify,
  type TemplateId,
} from "@/lib/ar/projects";
import { cn } from "@/lib/utils";

import { fetchTemplate } from "./api";

// "New endcap": name, who it's for, its link, and where to start from.

export function NewProjectDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [template, setTemplate] = useState<TemplateId>("roblox");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<"unknown" | "checking" | "free" | "taken">(
    "unknown",
  );

  // which templates exist; the JSON files may not be deployed yet
  const templates = useQuery({
    queryKey: ["ar-builder", "templates"],
    enabled: open,
    staleTime: 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        TEMPLATES.filter((t) => t.id !== "blank").map(
          async (t) => [t.id, await fetchTemplate(t.id)] as const,
        ),
      );
      return Object.fromEntries(entries) as Partial<Record<TemplateId, unknown>>;
    },
  });
  const available = (id: TemplateId) => id === "blank" || !!templates.data?.[id];

  useEffect(() => {
    if (!open) return;
    setName("");
    setClient("");
    setSlug("");
    setSlugTouched(false);
    setError(null);
    setBusy(false);
    setAvailability("unknown");
  }, [open]);

  // fall back to Blank when the default template isn't there
  useEffect(() => {
    if (templates.data && !available(template))
      setTemplate(TEMPLATES.find((t) => available(t.id))!.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templates.data]);

  const slugValid = isValidSlug(slug);
  useEffect(() => {
    if (!slugValid) return setAvailability("unknown");
    setAvailability("checking");
    const t = setTimeout(async () => {
      try {
        const r = await slugAvailableFn({ data: { slug } });
        setAvailability(r.available ? "free" : "taken");
      } catch {
        setAvailability("unknown");
      }
    }, 300);
    return () => clearTimeout(t);
  }, [slug, slugValid]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slugValid || availability === "taken" || busy) return;
    setBusy(true);
    setError(null);
    try {
      const source = template === "blank" ? undefined : templates.data?.[template];
      const r = await createProjectFn({
        data: { slug, name: name.trim(), client: client.trim() || undefined, source },
      });
      if (r.ok) {
        onOpenChange(false);
        await navigate({ to: "/admin/builder/$slug", params: { slug: r.slug } });
        return;
      }
      if (r.error === "taken") {
        setAvailability("taken");
        setError("That link is taken. Try another.");
      } else if (r.error === "invalid") {
        setError("The template didn't load correctly. Start from Blank, or try again later.");
      } else setError("Use lowercase letters, numbers and dashes for the link.");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      setError(
        msg === "unauthorized"
          ? "Your session ended. Sign in again."
          : "Couldn't create the endcap. Try again.",
      );
      toast.error("Couldn't create the endcap");
    } finally {
      setBusy(false);
    }
  }

  const slugMsg =
    slug && !slugValid
      ? { tone: "err", text: "Lowercase letters, numbers and dashes, not ending in a dash" }
      : availability === "taken"
        ? { tone: "err", text: "Taken. Try another." }
        : availability === "free"
          ? { tone: "ok", text: "Available" }
          : null;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <form onSubmit={create} className="space-y-5">
          <DialogHeader>
            <DialogTitle>New endcap</DialogTitle>
            <DialogDescription>
              Start from a finished demo and make it theirs, or from a blank endcap.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <label htmlFor="np-name" className="mb-1.5 block text-xs font-medium">
                Name
              </label>
              <Input
                id="np-name"
                autoFocus
                value={name}
                maxLength={80}
                placeholder="EVADE × Walmart Q4 pitch"
                onChange={(e) => {
                  setName(e.target.value);
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
              <p className="mt-1.5 text-xs text-muted-foreground">
                For the team. Clients don't see it.
              </p>
            </div>
            <div>
              <label htmlFor="np-client" className="mb-1.5 block text-xs font-medium">
                Prepared for <span className="font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input
                id="np-client"
                value={client}
                maxLength={80}
                placeholder="Roblox"
                onChange={(e) => setClient(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="np-slug" className="mb-1.5 block text-xs font-medium">
                Link
              </label>
              <div className="relative">
                <span className="mono pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-xs text-muted-foreground">
                  medialife.ai/x/
                </span>
                <Input
                  id="np-slug"
                  value={slug}
                  spellCheck={false}
                  aria-invalid={slugMsg?.tone === "err"}
                  aria-describedby="np-slug-msg"
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(cleanSlugInput(e.target.value));
                  }}
                  className="mono pl-[118px] text-xs aria-[invalid=true]:border-destructive/70"
                />
                {availability === "checking" ? (
                  <Loader2
                    className="absolute top-1/2 right-3 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground"
                    aria-hidden
                  />
                ) : null}
              </div>
              <p
                id="np-slug-msg"
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

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium">Start from</legend>
              <div className="grid grid-cols-2 gap-2">
                {TEMPLATES.map((t) => {
                  const on = template === t.id;
                  const ok = available(t.id);
                  const loading = t.id !== "blank" && templates.isPending;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      disabled={!ok}
                      onClick={() => setTemplate(t.id)}
                      className={cn(
                        "relative rounded-lg border p-3 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
                        on
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/40",
                      )}
                    >
                      <span className="flex items-center justify-between gap-2 text-sm font-medium">
                        {t.label}
                        {on ? <Check className="size-3.5 text-primary" aria-hidden /> : null}
                      </span>
                      <span className="mt-1 block text-xs leading-snug text-muted-foreground">
                        {loading ? "Checking…" : ok ? t.description : "Not available yet"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </fieldset>
          </div>

          {error ? (
            <p
              className="rounded-md border border-destructive/40 bg-destructive/10 p-2.5 text-sm"
              role="alert"
            >
              {error}
            </p>
          ) : null}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={busy || !name.trim() || !slugValid || availability === "taken"}
            >
              {busy ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {busy ? "Creating…" : "Create endcap"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
