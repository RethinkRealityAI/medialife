import { useMemo, useState } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Segmented } from "@/components/ar-builder/fields";
import { Panel, PanelTitle } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BACKDROPS, DEFAULT_SHELF } from "@/lib/shelf/config";
import { quickLinkPath, THEME_PRESETS, type QuickLinkInput } from "@/lib/shelf/shelves";
import { cn } from "@/lib/utils";

import { copyText, useOrigin } from "./shared";

// For reps who just need a name-only link: no shelf to publish, the page reads
// everything from the URL (/shelf?name=…&neon=…) and falls back to the default
// shelf for the rest.

const BACKDROP_LABEL: Record<(typeof BACKDROPS)[number], string> = {
  midnight: "Midnight",
  sunset: "Sunset",
  arcade: "Arcade",
  snow: "Snow",
};

export function QuickLinkGenerator() {
  const [v, setV] = useState<QuickLinkInput>({
    name: "",
    handle: "",
    neon: DEFAULT_SHELF.theme.neon,
    backdrop: DEFAULT_SHELF.theme.backdrop,
    invite: "",
    for: "",
    by: "",
  });
  const set = (patch: Partial<QuickLinkInput>) => setV((x) => ({ ...x, ...patch }));
  const path = useMemo(() => quickLinkPath(v), [v]);
  const url = useOrigin() + path;

  const field = (
    id: keyof QuickLinkInput,
    label: string,
    placeholder: string,
    max: number,
    mono = false,
  ) => (
    <div className="min-w-0">
      <label htmlFor={`ql-${id}`} className="mb-1.5 block text-xs font-medium text-foreground/90">
        {label}
      </label>
      <Input
        id={`ql-${id}`}
        value={v[id] ?? ""}
        maxLength={max}
        placeholder={placeholder}
        spellCheck={!mono}
        className={cn("h-9 bg-background/60", mono && "mono text-xs")}
        onChange={(e) =>
          set({
            [id]:
              id === "invite"
                ? e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "")
                : e.target.value,
          })
        }
      />
    </div>
  );

  return (
    <Panel className="p-5">
      <PanelTitle
        title="Quick link"
        sub="A name-only shelf for outreach, no publishing needed. Everything else comes from the default shelf."
      />
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
        {field("name", "Name on the sign", "PixelPine", 28)}
        {field("handle", "Handle", "@pixelpine", 40)}
        {field("for", "Prepared for", "PixelPine", 60)}
        {field("by", "Presented by", "Snowday Media × MEDIALIFE", 60)}
        {field("invite", "Invite code", "snowday", 40, true)}
        <div className="min-w-0">
          <span className="mb-1.5 block text-xs font-medium text-foreground/90">Neon</span>
          <div className="flex flex-wrap items-center gap-1.5">
            {THEME_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                title={p.label}
                aria-label={`${p.label} neon`}
                aria-pressed={v.neon === p.neon}
                onClick={() => set({ neon: p.neon, backdrop: p.backdrop })}
                className={cn(
                  "size-7 rounded-full border border-white/15 transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  v.neon === p.neon && "ring-2 ring-foreground/70",
                )}
                style={{ background: p.neon, boxShadow: `0 0 10px -2px ${p.neon}` }}
              />
            ))}
            <label
              className="relative size-7 cursor-pointer overflow-hidden rounded-full border border-dashed border-white/30 focus-within:ring-2 focus-within:ring-ring"
              title="Custom colour"
              style={{
                background: THEME_PRESETS.some((p) => p.neon === v.neon) ? "transparent" : v.neon,
              }}
            >
              <span className="sr-only">Custom neon colour</span>
              <input
                type="color"
                value={v.neon}
                onChange={(e) => set({ neon: e.target.value })}
                className="absolute inset-0 size-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <Segmented
            label="Backdrop"
            value={(v.backdrop ?? "midnight") as (typeof BACKDROPS)[number]}
            options={BACKDROPS.map((b) => ({ value: b, label: BACKDROP_LABEL[b] }))}
            onChange={(b) => set({ backdrop: b })}
          />
        </div>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row xl:flex-col">
        <Input
          readOnly
          value={url}
          aria-label="Quick link"
          data-testid="quick-link-url"
          onFocus={(e) => e.target.select()}
          className="mono h-9 min-w-0 flex-1 text-xs"
        />
        <div className="flex gap-2">
          <Button
            type="button"
            size="sm"
            className="h-9"
            onClick={async () => {
              if (await copyText(url)) toast.success("Quick link copied");
            }}
          >
            <Copy aria-hidden /> Copy
          </Button>
          <Button asChild type="button" variant="outline" size="sm" className="h-9">
            <a
              href={`${path}${path.includes("?") ? "&" : "?"}notrack=1`}
              target="_blank"
              rel="noreferrer"
            >
              <ExternalLink aria-hidden /> Open
            </a>
          </Button>
        </div>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        To see when they open it, make a personal link to “Merch shelf (quick link)” in Client links
        and add its <span className="mono">&amp;c=CODE</span> to this URL, or publish a shelf for
        them.
      </p>
    </Panel>
  );
}
