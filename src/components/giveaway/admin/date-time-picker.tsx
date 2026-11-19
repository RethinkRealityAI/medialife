/**
 * Date + time picker for the campaign builder: a button that opens a calendar,
 * with a time list and quick picks underneath. Times are in the viewer's own
 * time zone (the team works from Toronto, so that's Eastern).
 */
import { useState } from "react";
import { CalendarDays, Clock, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/** Every half hour, plus 11:59 PM so "ends at the end of the day" is one pick. */
const TIMES: { value: string; label: string }[] = (() => {
  const out: { value: string; label: string }[] = [];
  for (let m = 0; m < 24 * 60; m += 30) out.push(slot(Math.floor(m / 60), m % 60));
  out.push(slot(23, 59));
  return out;
})();

function slot(h: number, m: number) {
  const label = new Date(2000, 0, 1, h, m).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return { value: `${h}:${m}`, label };
}

const QUICK: { label: string; h: number; m: number }[] = [
  { label: "Start of day", h: 0, m: 0 },
  { label: "Noon", h: 12, m: 0 },
  { label: "End of day", h: 23, m: 59 },
];

const tzName = () => {
  try {
    return (
      new Intl.DateTimeFormat("en-US", { timeZoneName: "short" })
        .formatToParts(new Date())
        .find((p) => p.type === "timeZoneName")?.value ?? ""
    );
  } catch {
    return "";
  }
};

export function DateTimePicker({
  value,
  onChange,
  defaultTime = { h: 12, m: 0 },
  placeholder = "Pick a date",
  id,
}: {
  value: number | null;
  onChange: (ms: number | null) => void;
  /** Time used when a day is picked before any time is set. */
  defaultTime?: { h: number; m: number };
  placeholder?: string;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const d = value ? new Date(value) : null;
  const time = d ? `${d.getHours()}:${d.getMinutes()}` : "";
  const timeKnown = TIMES.some((t) => t.value === time);

  const at = (day: Date, h: number, m: number) =>
    new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m).getTime();

  const pickDay = (day: Date | undefined) => {
    if (!day) return;
    onChange(at(day, d?.getHours() ?? defaultTime.h, d?.getMinutes() ?? defaultTime.m));
  };
  const pickTime = (h: number, m: number) => onChange(at(d ?? new Date(), h, m));

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            className={cn(
              "h-9 min-w-0 flex-1 justify-start gap-2 px-3 font-normal",
              !d && "text-muted-foreground",
            )}
          >
            <CalendarDays className="size-4 shrink-0 opacity-70" aria-hidden />
            <span className="truncate">
              {d
                ? d.toLocaleString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "numeric",
                    minute: "2-digit",
                  })
                : placeholder}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            mode="single"
            selected={d ?? undefined}
            defaultMonth={d ?? undefined}
            onSelect={pickDay}
            captionLayout="dropdown"
            startMonth={new Date(new Date().getFullYear() - 1, 0)}
            endMonth={new Date(new Date().getFullYear() + 3, 11)}
          />
          <div className="grid gap-2.5 border-t border-border p-3">
            <div className="flex items-center gap-2">
              <Clock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <Select
                value={timeKnown ? time : undefined}
                onValueChange={(v) => {
                  const [h, m] = v.split(":").map(Number);
                  pickTime(h, m);
                }}
              >
                <SelectTrigger className="h-8 flex-1" aria-label="Time">
                  <SelectValue
                    placeholder={
                      d
                        ? d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                        : "Time"
                    }
                  />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {TIMES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="text-xs text-muted-foreground">{tzName()}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK.map((q) => (
                <Button
                  key={q.label}
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="h-7 px-2.5 text-xs"
                  onClick={() => pickTime(q.h, q.m)}
                >
                  {q.label}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                className="ml-auto h-7 px-3 text-xs"
                onClick={() => setOpen(false)}
              >
                Done
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {d ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-9 shrink-0 text-muted-foreground"
          aria-label="Clear date"
          onClick={() => onChange(null)}
        >
          <X className="size-4" aria-hidden />
        </Button>
      ) : null}
    </div>
  );
}
