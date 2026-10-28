/**
 * The brief's shot list as a checklist. Ticks save as you go (whole list,
 * debounced) and the upload form pre-fills from them. Required shots are
 * marked in words, not only colour.
 */
import { useEffect, useRef, useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { setUgcShotTicks } from "@/lib/ugc/creator.functions";
import type { UgcShot } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

export function ShotChecklist({
  campaignId,
  shots,
  initial,
}: {
  campaignId: string;
  shots: UgcShot[];
  initial: string[];
}) {
  const [ticked, setTicked] = useState(() => new Set(initial));
  const [saving, setSaving] = useState<"idle" | "saving" | "saved">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const last = useRef(new Set(initial));

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  function toggle(id: string) {
    const next = new Set(ticked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setTicked(next);
    if (timer.current) clearTimeout(timer.current);
    setSaving("saving");
    timer.current = setTimeout(async () => {
      try {
        const r = await setUgcShotTicks({ data: { campaignId, shotIds: [...next] } });
        if (!r.ok) throw new Error(r.error);
        last.current = new Set(r.tickedShotIds);
        setSaving("saved");
      } catch {
        setTicked(new Set(last.current));
        setSaving("idle");
        toast.error("Couldn't save your ticks. Check your connection and try again.");
      }
    }, 450);
  }

  const done = shots.filter((s) => ticked.has(s.id)).length;
  const required = shots.filter((s) => s.required);
  const reqDone = required.filter((s) => ticked.has(s.id)).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground tabular-nums">
            {done} of {shots.length}
          </span>{" "}
          filmed
          {required.length ? (
            <span className="tabular-nums">
              {" "}
              · {reqDone}/{required.length} required
            </span>
          ) : null}
        </p>
        <span aria-live="polite" className="text-xs text-muted-foreground">
          {saving === "saving" ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="size-3 motion-safe:animate-spin" aria-hidden /> Saving
            </span>
          ) : saving === "saved" ? (
            "Saved"
          ) : null}
        </span>
      </div>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]" aria-hidden>
        <span
          className="block h-full rounded-full bg-[linear-gradient(90deg,#19affe,#3fe6e0)] transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${shots.length ? (done / shots.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="mt-4 space-y-2">
        {shots.map((s) => {
          const on = ticked.has(s.id);
          return (
            <li key={s.id}>
              <label
                className={cn(
                  "flex min-h-14 cursor-pointer items-start gap-3.5 rounded-2xl border p-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[#3fe6e0]",
                  on
                    ? "border-[#3fe6e0]/35 bg-[#3fe6e0]/[0.07]"
                    : "border-white/10 bg-white/[0.025] hover:border-white/20",
                )}
              >
                <input
                  type="checkbox"
                  className="peer sr-only"
                  checked={on}
                  onChange={() => toggle(s.id)}
                />
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-6 shrink-0 place-items-center rounded-lg border-2 transition-colors",
                    on ? "border-[#3fe6e0] bg-[#3fe6e0] text-[#04211f]" : "border-white/25",
                  )}
                >
                  {on ? <Check className="size-4" strokeWidth={3} /> : null}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={cn("text-[15px] font-medium", on && "text-[#d8fbf9]")}>
                      {s.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2 py-px font-mono text-[10px] tracking-[0.12em] uppercase",
                        s.required
                          ? "bg-[#f6c344]/12 text-[#ffe48a] ring-1 ring-[#f6c344]/30 ring-inset"
                          : "bg-white/[0.06] text-muted-foreground",
                      )}
                    >
                      {s.required ? "Required" : "Optional"}
                    </span>
                  </span>
                  {s.tip ? (
                    <span className="mt-1 block text-sm leading-relaxed text-muted-foreground">
                      {s.tip}
                    </span>
                  ) : null}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
