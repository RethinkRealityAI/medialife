/**
 * "Where is Bobo?" in the file drawer: where the file was filmed or
 * photographed (city search, optional venue, date seen) and the switch that
 * puts it on the public globe at /evade/where-is-bobo/.
 *
 * Part of the drawer's form: changes are saved with the drawer's Save button.
 */
import { useEffect, useRef, useState } from "react";
import { ExternalLink, Loader2, MapPin, Search, X } from "lucide-react";

import { well } from "@/components/admin/kit";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import {
  LOCATION_LIMITS,
  locationLabel,
  placeKey,
  type MediaLocation,
  type PlaceHit,
} from "@/lib/bobo/location";
import { GLOBE_KINDS, type MediaAssetView } from "@/lib/media/model";
import { cn } from "@/lib/utils";

import { FieldRow, cmdItem, tap } from "./parts";

export const BOBO_PAGE = "/evade/where-is-bobo/";

export type GlobeForm = { location: MediaLocation | null; onGlobe: boolean };

export const globeFormOf = (a: MediaAssetView): GlobeForm => ({
  location: a.location,
  onGlobe: a.onGlobe,
});

const sameLocation = (a: MediaLocation | null, b: MediaLocation | null) =>
  JSON.stringify(a) === JSON.stringify(b);

/** The patch fields for the drawer's Save. */
export function globeDiff(a: MediaAssetView, f: GlobeForm) {
  const p: { location?: MediaLocation | null; onGlobe?: boolean } = {};
  if (!sameLocation(a.location, f.location)) p.location = f.location;
  if (f.onGlobe !== a.onGlobe) p.onGlobe = f.onGlobe;
  return p;
}

const dayInput = (ms: number | null) => {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
// noon local time, so the day doesn't shift across time zones
const fromDayInput = (v: string) => (v ? new Date(`${v}T12:00:00`).getTime() || null : null);

const flag = (cc: string) =>
  /^[A-Z]{2}$/.test(cc)
    ? String.fromCodePoint(...[...cc].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65))
    : "";

export function GlobeLocationSection({
  a,
  value,
  onChange,
}: {
  a: MediaAssetView;
  value: GlobeForm;
  onChange: (v: GlobeForm) => void;
}) {
  const loc = value.location;
  const canGlobe = GLOBE_KINDS.includes(a.kind);
  const set = (p: Partial<MediaLocation>) =>
    loc && onChange({ ...value, location: { ...loc, ...p } });

  const status = !canGlobe
    ? null
    : a.liveOnGlobe
      ? { tone: "live", text: "Live on the globe." }
      : !value.onGlobe
        ? null
        : !loc
          ? { tone: "warn", text: "Add a location to show it on the globe." }
          : !a.public
            ? {
                tone: "warn",
                text: "Turn on the Public link above too: the globe only shows public files.",
              }
            : { tone: "warn", text: "Save to put it on the globe." };

  return (
    <section aria-labelledby="bobo-h" className={cn(well, "space-y-3 p-3")}>
      <div className="flex items-start gap-3">
        <MapPin className="mt-0.5 size-4 shrink-0 text-amber-300" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 id="bobo-h" className="text-sm font-medium">
            Where was this?
          </h3>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Tag the city and it can appear as a sighting on{" "}
            <a
              href={BOBO_PAGE}
              target="_blank"
              rel="noopener"
              className="underline decoration-white/30 underline-offset-2 hover:text-foreground"
            >
              Where is Bobo?
            </a>
          </p>
        </div>
      </div>

      <FieldRow label="City or country" id="bobo-city-l">
        <PlaceSearch
          labelledBy="bobo-city-l"
          value={loc}
          onPick={(hit) =>
            onChange({
              ...value,
              location: {
                place: loc?.place ?? "",
                city: hit.kind === "city" ? hit.city : "",
                region: hit.kind === "city" ? hit.region : "",
                country: hit.country,
                countryCode: hit.countryCode,
                lat: hit.lat,
                lng: hit.lng,
                seenAt: loc?.seenAt ?? null,
              },
            })
          }
          onClear={() => onChange({ ...value, location: null })}
        />
      </FieldRow>

      {loc ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <FieldRow
            label="Venue or landmark"
            htmlFor="bobo-place"
            hint="Optional, shown above the city."
          >
            <Input
              id="bobo-place"
              value={loc.place}
              onChange={(e) => set({ place: e.target.value })}
              maxLength={LOCATION_LIMITS.place}
              placeholder="Golden Gate Bridge"
              className={cn(tap, "bg-black/20")}
            />
          </FieldRow>
          <FieldRow label="Date seen" htmlFor="bobo-seen" hint="Blank uses the upload date.">
            <Input
              id="bobo-seen"
              type="date"
              value={dayInput(loc.seenAt)}
              max={dayInput(Date.now())}
              onChange={(e) => set({ seenAt: fromDayInput(e.target.value) })}
              className={cn(tap, "bg-black/20 [color-scheme:dark]")}
            />
          </FieldRow>
        </div>
      ) : null}

      {canGlobe ? (
        <div className="flex items-center gap-3 border-t border-white/[0.06] pt-3">
          <div className="min-w-0 flex-1">
            <label htmlFor="bobo-globe" className="block text-sm font-medium">
              Show on the globe
            </label>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              Needs a location and the Public link. Anyone can see it there.
            </p>
          </div>
          <Switch
            id="bobo-globe"
            checked={value.onGlobe}
            onCheckedChange={(v) => onChange({ ...value, onGlobe: v })}
          />
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          Only videos and images can go on the globe.
        </p>
      )}

      {status ? (
        <div
          role="status"
          className={cn(
            "flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs",
            status.tone === "live"
              ? "bg-emerald-400/10 text-emerald-200"
              : "bg-amber-400/10 text-amber-200",
          )}
        >
          <span className="min-w-0 flex-1">{status.text}</span>
          {status.tone === "live" && a.location ? (
            <a
              href={`${BOBO_PAGE}?at=${placeKey(a.location)}`}
              target="_blank"
              rel="noopener"
              className="inline-flex shrink-0 items-center gap-1 font-medium underline-offset-2 hover:underline"
            >
              View <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function PlaceSearch({
  labelledBy,
  value,
  onPick,
  onClear,
}: {
  labelledBy: string;
  value: MediaLocation | null;
  onPick: (hit: PlaceHit) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/bobo/places?q=${encodeURIComponent(q)}`, {
          credentials: "same-origin",
        });
        if (!r.ok) throw new Error(r.status === 401 ? "Sign in again to search" : "Search failed");
        const body = (await r.json()) as { places: PlaceHit[] };
        if (n === seq.current) {
          setHits(body.places);
          setError("");
        }
      } catch (err) {
        if (n === seq.current) setError(err instanceof Error ? err.message : "Search failed");
      } finally {
        if (n === seq.current) setLoading(false);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [query]);

  const label = value ? locationLabel(value, false) : "";
  return (
    <div className="flex gap-2">
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setQuery("");
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            role="combobox"
            aria-expanded={open}
            aria-labelledby={labelledBy}
            className={cn(
              "flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-black/20 px-3 text-left text-sm shadow-sm transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
              tap,
            )}
          >
            {value ? (
              <span aria-hidden className="text-base leading-none">
                {flag(value.countryCode)}
              </span>
            ) : (
              <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            )}
            <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
              {value ? (
                <>
                  {label}
                  {value.region && value.city ? (
                    <span className="text-muted-foreground"> · {value.region}</span>
                  ) : null}
                </>
              ) : (
                "Search a city…"
              )}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
          <Command shouldFilter={false}>
            <CommandInput
              value={query}
              onValueChange={setQuery}
              placeholder="Lagos, Tokyo, Paris FR…"
              maxLength={80}
            />
            <CommandList className="max-h-72">
              {loading ? (
                <div className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden /> Searching…
                </div>
              ) : null}
              {!loading ? (
                <CommandEmpty>
                  {error ||
                    (query.trim().length < 2
                      ? "Type a city or country."
                      : "No match. Try the nearest bigger city.")}
                </CommandEmpty>
              ) : null}
              {hits.length ? (
                <CommandGroup>
                  {hits.map((h) => (
                    <CommandItem
                      key={`${h.countryCode}-${h.city}-${h.lat}`}
                      value={`${h.countryCode}-${h.city}-${h.lat}`}
                      className={cmdItem}
                      onSelect={() => {
                        onPick(h);
                        setOpen(false);
                        setQuery("");
                      }}
                    >
                      <span aria-hidden className="text-base leading-none">
                        {flag(h.countryCode)}
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        {h.kind === "city" ? h.city : h.country}
                        <span className="text-muted-foreground">
                          {h.kind === "city"
                            ? ` · ${[h.region, h.country].filter(Boolean).join(", ")}`
                            : " · whole country"}
                        </span>
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("shrink-0 text-muted-foreground", tap, "w-11 sm:w-9")}
          onClick={onClear}
          aria-label="Remove location"
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
