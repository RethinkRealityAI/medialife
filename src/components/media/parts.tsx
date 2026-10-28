/**
 * Pieces the Media Library screens share: kind icons and thumbnails, small
 * badges, the combo field (free text with suggestions) and the tag editor.
 * Built on the admin kit so the library reads as part of /admin.
 */
import { useMemo, useState, type ReactNode } from "react";
import {
  Box,
  Check,
  ChevronsUpDown,
  FileArchive,
  FileAudio,
  FileJson,
  FileText,
  FileVideo,
  Globe,
  ImageIcon,
  Lock,
  Plus,
  Sparkles,
  Type,
  X,
  type LucideIcon,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  MEDIA,
  MEDIA_PRESET_TAGS,
  cleanTag,
  formatDuration,
  previewSrc,
  tagKey,
  type MediaAssetView,
  type MediaKind,
} from "@/lib/media/model";
import { cn } from "@/lib/utils";

export const KIND_ICON: Record<MediaKind, LucideIcon> = {
  video: FileVideo,
  image: ImageIcon,
  audio: FileAudio,
  model: Box,
  document: FileText,
  archive: FileArchive,
  font: Type,
  data: FileJson,
};

/** A tinted backdrop per kind, for files without a picture. */
const KIND_FILL: Record<MediaKind, string> = {
  video: "from-violet-500/30 via-indigo-500/15 to-transparent text-violet-200",
  image: "from-sky-500/30 via-sky-500/10 to-transparent text-sky-200",
  audio: "from-emerald-500/30 via-teal-500/10 to-transparent text-emerald-200",
  model: "from-fuchsia-500/30 via-violet-500/15 to-transparent text-fuchsia-200",
  document: "from-amber-500/25 via-orange-500/10 to-transparent text-amber-200",
  archive: "from-white/15 via-white/[0.04] to-transparent text-white/75",
  font: "from-rose-500/25 via-fuchsia-500/10 to-transparent text-rose-200",
  data: "from-cyan-500/25 via-sky-500/10 to-transparent text-cyan-200",
};

/** Admin controls: 44px tall on phones, the kit's 36px from sm up. */
export const tap = "h-11 sm:h-9";
export const tapIcon = "size-11 sm:size-9";
/** Command rows: a quiet highlight (the theme accent is hot pink) and a finger-sized row. */
export const cmdItem =
  "min-h-11 sm:min-h-9 data-[selected=true]:bg-white/[0.08] data-[selected=true]:text-foreground";

const CHECKER =
  "bg-[conic-gradient(at_50%_50%,#17151f_25%,#1e1b29_0_50%,#17151f_0_75%,#1e1b29_0)] bg-[length:14px_14px]";

/**
 * The asset's picture (thumbnail, poster frame or the image itself) or its
 * kind's icon on a tinted backdrop. `fit` contain keeps transparent art whole.
 */
export function AssetThumb({
  a,
  className,
  fit = "cover",
  iconSize = "size-7",
}: {
  a: Pick<MediaAssetView, "thumbUrl" | "kind" | "mime" | "fileUrl" | "size" | "color" | "name">;
  className?: string;
  fit?: "cover" | "contain";
  iconSize?: string;
}) {
  const src = previewSrc(a);
  const [failed, setFailed] = useState(false);
  const Icon = KIND_ICON[a.kind];
  const transparent = /png|webp|gif|avif|svg/.test(a.mime);
  return (
    <span
      aria-hidden
      className={cn(
        "relative grid place-items-center overflow-hidden bg-black/40",
        src && !failed && transparent && CHECKER,
        className,
      )}
      style={
        !src || failed
          ? undefined
          : a.color && !transparent
            ? { backgroundColor: a.color }
            : undefined
      }
    >
      {src && !failed ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className={cn(
            "size-full",
            fit === "contain" || transparent ? "object-contain p-[6%]" : "object-cover",
          )}
        />
      ) : (
        <span
          className={cn(
            "absolute inset-0 grid place-items-center bg-gradient-to-br",
            KIND_FILL[a.kind],
          )}
        >
          <span className="flex flex-col items-center gap-1.5">
            <Icon className={cn(iconSize, "opacity-90")} />
            <span className="mono text-[10px] font-semibold tracking-[0.14em] uppercase opacity-70">
              {a.name.includes(".") ? a.name.split(".").pop() : a.kind}
            </span>
          </span>
        </span>
      )}
    </span>
  );
}

/** A tiny overlay chip on a thumbnail. */
export function ThumbChip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1 rounded-full bg-black/65 px-2 text-[11px] font-medium text-white/90 ring-1 ring-white/10 backdrop-blur-md [&_svg]:size-3",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function VisibilityBadge({
  isPublic,
  className,
}: {
  isPublic: boolean;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 ring-inset [&_svg]:size-3",
        isPublic
          ? "bg-emerald-400/15 text-emerald-200 ring-emerald-400/30"
          : "bg-white/[0.06] text-white/60 ring-white/10",
        className,
      )}
    >
      {isPublic ? <Globe aria-hidden /> : <Lock aria-hidden />}
      {isPublic ? "Public" : "Private"}
    </span>
  );
}

export function AiBadge({ className }: { className?: string }) {
  return (
    <span
      title="AI-generated"
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full bg-fuchsia-400/15 px-2 text-[11px] font-medium text-fuchsia-200 ring-1 ring-fuchsia-400/30 ring-inset [&_svg]:size-3",
        className,
      )}
    >
      <Sparkles aria-hidden />
      AI
    </span>
  );
}

/** "1920×1080 · 0:42" */
export function quickFacts(a: Pick<MediaAssetView, "width" | "height" | "durationS" | "aspect">) {
  return [
    a.width && a.height ? `${a.width}×${a.height}` : null,
    a.durationS != null ? formatDuration(a.durationS) : null,
  ].filter(Boolean) as string[];
}

/* ── Combo field: free text with suggestions ──────────────────────────────── */

export type Suggestion = { value: string; count?: number };

/**
 * A free-text field with suggestions from existing values (client, collection,
 * rights). Opens a searchable list; typing something new offers "Use …".
 */
export function ComboField({
  id,
  value,
  onChange,
  suggestions,
  placeholder,
  maxLength,
  className,
  emptyLabel = "None",
  icon: Icon,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  suggestions: Suggestion[];
  placeholder: string;
  maxLength: number;
  className?: string;
  emptyLabel?: string;
  icon?: LucideIcon;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const typed = query.replace(/\s+/g, " ").trim().slice(0, maxLength);
  const exists = suggestions.some((s) => s.value.toLowerCase() === typed.toLowerCase());
  const pick = (v: string) => {
    onChange(v);
    setQuery("");
    setOpen(false);
  };
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>
        <button
          id={id}
          type="button"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "flex w-full min-w-0 items-center gap-2 rounded-md border border-input bg-black/20 px-3 text-left text-sm shadow-sm transition-colors hover:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none",
            tap,
            className,
          )}
        >
          {Icon ? <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden /> : null}
          <span className={cn("min-w-0 flex-1 truncate", !value && "text-muted-foreground")}>
            {value || placeholder}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(20rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder="Search or type a new one…"
            maxLength={maxLength}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Type a name to add it.</CommandEmpty>
            {typed && !exists ? (
              <CommandGroup>
                <CommandItem
                  className={cmdItem}
                  value={`__use ${typed}`}
                  onSelect={() => pick(typed)}
                >
                  <Plus aria-hidden />
                  Use “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            {suggestions.length ? (
              <CommandGroup heading="Suggestions">
                {suggestions.map((s) => (
                  <CommandItem
                    className={cmdItem}
                    key={s.value}
                    value={s.value}
                    onSelect={() => pick(s.value)}
                  >
                    <Check
                      className={cn("size-4", value === s.value ? "opacity-100" : "opacity-0")}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{s.value}</span>
                    {s.count ? (
                      <span className="text-xs text-muted-foreground tabular-nums">{s.count}</span>
                    ) : null}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {value ? (
              <CommandGroup>
                <CommandItem className={cmdItem} value="__clear" onSelect={() => pick("")}>
                  <X aria-hidden />
                  {emptyLabel}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Existing values first (with counts), then presets not used yet. */
export function mergeSuggestions(
  existing: { value: string; count: number }[],
  presets: readonly string[] = [],
): Suggestion[] {
  const seen = new Set(existing.map((e) => e.value.toLowerCase()));
  return [
    ...existing,
    ...presets.filter((p) => !seen.has(p.toLowerCase())).map((value) => ({ value })),
  ];
}

/* ── Tags ─────────────────────────────────────────────────────────────────── */

export function TagChip({
  tag,
  onRemove,
  className,
}: {
  tag: string;
  onRemove?: () => void;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-7 max-w-full items-center gap-1 rounded-full border border-white/[0.1] bg-white/[0.05] pr-1 pl-2.5 text-xs text-white/85",
        !onRemove && "pr-2.5",
        className,
      )}
    >
      <span className="truncate">{tag}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="-my-2 grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none sm:size-6"
          aria-label={`Remove tag ${tag}`}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** The "Add tag" popover: your tags (most used first), the presets, and anything typed. */
export function AddTagPopover({
  selected,
  onAdd,
  known,
  trigger,
  align = "start",
}: {
  selected: string[];
  onAdd: (tag: string) => void;
  known: { value: string; count: number }[];
  trigger: ReactNode;
  align?: "start" | "end" | "center";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const have = useMemo(() => new Set(selected.map(tagKey)), [selected]);
  const typed = cleanTag(query);
  const all = useMemo(
    () =>
      new Set(
        [...known.map((k) => k.value), ...Object.values(MEDIA_PRESET_TAGS).flat()].map(tagKey),
      ),
    [known],
  );
  const full = selected.length >= MEDIA.limits.tagsPerAsset;
  const add = (t: string) => {
    const c = cleanTag(t);
    if (!c || have.has(tagKey(c)) || full) return;
    onAdd(c);
    setQuery("");
  };
  const knownKeys = new Set(known.map((k) => tagKey(k.value)));
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-[min(18rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={full ? "That's the most tags a file can have" : "Search or create a tag…"}
            maxLength={MEDIA.limits.tag}
            disabled={full}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Type a name to create a tag.</CommandEmpty>
            {typed && !all.has(tagKey(typed)) ? (
              <CommandGroup>
                <CommandItem
                  className={cmdItem}
                  value={`__create ${typed}`}
                  onSelect={() => add(typed)}
                >
                  <Plus aria-hidden />
                  Create “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            {known.length ? (
              <CommandGroup heading="In the library">
                {known.map((k) => (
                  <CommandItem
                    className={cmdItem}
                    key={k.value}
                    value={k.value}
                    onSelect={() => add(k.value)}
                    disabled={have.has(tagKey(k.value))}
                  >
                    <Check
                      className={cn(
                        "size-4",
                        have.has(tagKey(k.value)) ? "opacity-100" : "opacity-0",
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 truncate">{k.value}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">{k.count}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {Object.entries(MEDIA_PRESET_TAGS).map(([group, tags]) => {
              const rest = tags.filter((t) => !knownKeys.has(tagKey(t)));
              return rest.length ? (
                <CommandGroup key={group} heading={group}>
                  {rest.map((t) => (
                    <CommandItem
                      className={cmdItem}
                      key={t}
                      value={t}
                      onSelect={() => add(t)}
                      disabled={have.has(tagKey(t))}
                    >
                      <Check
                        className={cn("size-4", have.has(tagKey(t)) ? "opacity-100" : "opacity-0")}
                        aria-hidden
                      />
                      {t}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ) : null;
            })}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Chips plus "Add tag": the editor for one file's (or a batch's) tags. */
export function TagEditor({
  value,
  onChange,
  known,
  className,
  labelledBy,
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  known: { value: string; count: number }[];
  className?: string;
  labelledBy?: string;
}) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={cn("flex flex-wrap items-center gap-1.5", className)}
    >
      {value.map((t) => (
        <TagChip
          key={tagKey(t)}
          tag={t}
          onRemove={() => onChange(value.filter((x) => tagKey(x) !== tagKey(t)))}
        />
      ))}
      <AddTagPopover
        selected={value}
        known={known}
        onAdd={(t) => onChange([...value, t])}
        trigger={
          <button
            type="button"
            className="inline-flex h-11 items-center gap-1 rounded-full border border-dashed border-white/20 px-3 text-xs text-muted-foreground hover:border-[var(--partner)] hover:text-foreground focus-visible:ring-2 focus-visible:ring-[var(--partner)] focus-visible:outline-none sm:h-7"
          >
            <Plus className="size-3" aria-hidden /> Add tag
          </button>
        }
      />
    </div>
  );
}

/** A labelled form row. */
export function FieldRow({
  label,
  htmlFor,
  id,
  hint,
  children,
  className,
}: {
  label: string;
  htmlFor?: string;
  id?: string;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label id={id} htmlFor={htmlFor} className="block text-xs font-medium text-white/75">
        {label}
      </label>
      {children}
      {hint ? <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
