/** The "where will you post it" and "which shots does it cover" fields. */
import { useId } from "react";
import { Check } from "lucide-react";

import { select } from "@/components/ugc/shared/look";
import {
  UGC_POST_PLATFORMS,
  UGC_POST_PLATFORM_LABELS,
  type UgcPostPlatform,
  type UgcShot,
} from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export function PlatformField({
  value,
  onChange,
  disabled,
}: {
  value: UgcPostPlatform | null;
  onChange: (v: UgcPostPlatform) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium">
        Posting on
      </label>
      <select
        id={id}
        className={select}
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as UgcPostPlatform)}
      >
        {value == null ? <option value="">Choose…</option> : null}
        {UGC_POST_PLATFORMS.map((p) => (
          <option key={p} value={p}>
            {UGC_POST_PLATFORM_LABELS[p]}
          </option>
        ))}
      </select>
    </div>
  );
}

export function ShotsField({
  shots,
  value,
  onChange,
  disabled,
}: {
  shots: UgcShot[];
  value: string[];
  onChange: (v: string[]) => void;
  disabled?: boolean;
}) {
  const id = useId();
  if (!shots.length) return null;
  const on = new Set(value);
  return (
    <fieldset disabled={disabled} aria-describedby={`${id}-hint`}>
      <legend className="mb-1.5 text-sm font-medium">Shots in this file</legend>
      <p id={`${id}-hint`} className="sr-only">
        Pre-filled from the shots you ticked in the brief.
      </p>
      <div className="flex flex-wrap gap-2">
        {shots.map((s) => {
          const checked = on.has(s.id);
          return (
            <label
              key={s.id}
              className={cn(
                "inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-3.5 text-sm transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#3fe6e0]",
                checked
                  ? "border-[#3fe6e0]/50 bg-[#3fe6e0]/12 text-[#d8fbf9]"
                  : "border-white/12 bg-white/[0.03] text-[#c9d1d8] hover:border-white/25",
              )}
            >
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => {
                  const next = new Set(on);
                  if (checked) next.delete(s.id);
                  else next.add(s.id);
                  onChange(shots.map((x) => x.id).filter((x) => next.has(x)));
                }}
              />
              <span
                aria-hidden
                className={cn(
                  "grid size-4 place-items-center rounded-[5px] border",
                  checked ? "border-[#3fe6e0] bg-[#3fe6e0] text-[#04211f]" : "border-white/30",
                )}
              >
                {checked ? <Check className="size-3" strokeWidth={3.5} /> : null}
              </span>
              {s.label}
              {s.required ? <span className="text-[11px] text-[#ffe48a]">· required</span> : null}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
