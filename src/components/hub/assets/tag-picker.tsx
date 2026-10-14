/**
 * Tags on a file (or a batch of files): chips you can remove, and an "Add tag"
 * popover that searches your own tags and the presets, and creates anything
 * you type. Enter adds, and the popover stays open for the next one.
 */
import { useMemo, useState } from "react";
import { Check, Plus, X } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ASSET_LIMITS, PRESET_TAGS, cleanTag, tagKey } from "@/lib/hub/assets";
import { cn } from "@/lib/utils";

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
        "inline-flex h-6 max-w-full items-center gap-1 rounded-full border border-border bg-white/[0.04] pr-1 pl-2.5 text-xs",
        !onRemove && "pr-2.5",
        className,
      )}
    >
      <span className="truncate">{tag}</span>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="grid size-4 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-white/10 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          aria-label={`Remove tag ${tag}`}
        >
          <X className="size-3" aria-hidden />
        </button>
      ) : null}
    </span>
  );
}

/** The "Add tag" popover on its own (for bulk tagging, where there are no chips). */
export function AddTagPopover({
  selected,
  onAdd,
  yourTags,
  trigger,
  align = "start",
}: {
  /** Already on the file(s): shown ticked, and not offered again. */
  selected: string[];
  onAdd: (tag: string) => void;
  /** Tags used anywhere in the library, most used first. */
  yourTags: string[];
  trigger: React.ReactNode;
  align?: "start" | "end" | "center";
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const have = useMemo(() => new Set(selected.map(tagKey)), [selected]);
  const typed = cleanTag(query);
  const known = useMemo(() => {
    const all = new Set([...yourTags, ...Object.values(PRESET_TAGS).flat()].map(tagKey));
    return all;
  }, [yourTags]);
  const full = selected.length >= ASSET_LIMITS.tagsPerFile;

  const add = (t: string) => {
    const c = cleanTag(t);
    if (!c || have.has(tagKey(c)) || full) return;
    onAdd(c);
    setQuery("");
  };

  const presetGroups = Object.entries(PRESET_TAGS).map(
    ([group, tags]) =>
      [group, tags.filter((t) => !yourTags.some((y) => tagKey(y) === tagKey(t)))] as const,
  );

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent align={align} className="w-72 p-0">
        <Command>
          <CommandInput
            value={query}
            onValueChange={setQuery}
            placeholder={full ? "That's the most tags a file can have" : "Search or create a tag…"}
            maxLength={ASSET_LIMITS.tagLength}
            disabled={full}
          />
          <CommandList className="max-h-72">
            <CommandEmpty>Type a name to create a tag.</CommandEmpty>
            {typed && !known.has(tagKey(typed)) ? (
              <CommandGroup>
                <CommandItem value={`__create ${typed}`} onSelect={() => add(typed)}>
                  <Plus aria-hidden />
                  Create “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
            {yourTags.length ? (
              <CommandGroup heading="Your tags">
                {yourTags.map((t) => (
                  <TagOption key={t} tag={t} on={have.has(tagKey(t))} onSelect={add} />
                ))}
              </CommandGroup>
            ) : null}
            {presetGroups.map(([group, tags]) =>
              tags.length ? (
                <CommandGroup key={group} heading={group}>
                  {tags.map((t) => (
                    <TagOption key={t} tag={t} on={have.has(tagKey(t))} onSelect={add} />
                  ))}
                </CommandGroup>
              ) : null,
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function TagOption({
  tag,
  on,
  onSelect,
}: {
  tag: string;
  on: boolean;
  onSelect: (t: string) => void;
}) {
  return (
    <CommandItem value={tag} onSelect={() => onSelect(tag)} disabled={on} aria-selected={on}>
      <Check className={cn("size-4", on ? "opacity-100" : "opacity-0")} aria-hidden />
      {tag}
    </CommandItem>
  );
}

/** Chips plus "Add tag": the editor for one file's tags. */
export function TagPicker({
  value,
  onChange,
  yourTags,
  className,
  size = "default",
}: {
  value: string[];
  onChange: (tags: string[]) => void;
  yourTags: string[];
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)}>
      {value.map((t) => (
        <TagChip
          key={tagKey(t)}
          tag={t}
          onRemove={() => onChange(value.filter((x) => tagKey(x) !== tagKey(t)))}
        />
      ))}
      <AddTagPopover
        selected={value}
        yourTags={yourTags}
        onAdd={(t) => onChange([...value, t])}
        trigger={
          <button
            type="button"
            className={cn(
              "inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:border-primary/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              size === "sm" ? "h-6" : "h-7",
            )}
          >
            <Plus className="size-3" aria-hidden /> Add tag
          </button>
        }
      />
    </div>
  );
}
