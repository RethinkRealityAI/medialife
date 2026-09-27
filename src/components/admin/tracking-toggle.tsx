import { useEffect, useId, useState } from "react";

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

// The demo pages' tracker (public/vendor/ar-kit/track.js) skips any browser
// with localStorage "ml-ar-notrack" = "1". The admin runs on the same origin as
// the demos, so flipping it here keeps the team's own visits out of the data.

const KEY = "ml-ar-notrack";

function readExcluded(): boolean {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function TrackingToggle({ className }: { className?: string }) {
  const id = useId();
  // unknown until mounted: localStorage doesn't exist during SSR
  const [excluded, setExcluded] = useState<boolean | null>(null);

  useEffect(() => {
    setExcluded(readExcluded());
    const onStorage = (e: StorageEvent) => e.key === KEY && setExcluded(readExcluded());
    addEventListener("storage", onStorage);
    return () => removeEventListener("storage", onStorage);
  }, []);

  function set(tracked: boolean) {
    try {
      if (tracked) localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, "1");
    } catch {
      /* storage blocked: nothing to remember */
    }
    setExcluded(readExcluded());
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className="flex h-9 items-center gap-2.5 self-start rounded-md border border-border px-3">
        <label htmlFor={id} className="cursor-pointer text-xs whitespace-nowrap">
          <span className="text-muted-foreground">This browser: </span>
          <span className={excluded ? "text-amber-300" : "text-foreground"}>
            {excluded === null ? "…" : excluded ? "excluded" : "tracked"}
          </span>
        </label>
        <Switch
          id={id}
          checked={excluded === false}
          disabled={excluded === null}
          onCheckedChange={set}
          aria-describedby={`${id}-hint`}
          className="data-[state=unchecked]:bg-white/15"
        />
      </div>
      <p id={`${id}-hint`} className="text-[11px] leading-snug text-muted-foreground">
        {excluded
          ? "Your own visits to the demos from this browser don't count."
          : "Switch off so your own visits to the demos don't count."}
      </p>
    </div>
  );
}
