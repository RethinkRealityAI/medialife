/** Small display helpers for UGC Hub pages (creator and admin). */
import { daysLeft } from "@/lib/ugc/model";

/** 0:07, 1:32, 12:05. */
export function formatDuration(s: number | null | undefined): string | null {
  if (s == null || !Number.isFinite(s)) return null;
  const total = Math.max(0, Math.round(s));
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

/** "Oct 28", or "Oct 28, 2025" outside this year. */
export function dayDate(ts: number, now = Date.now()): string {
  const d = new Date(ts);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** "Tue, Nov 11". */
export function weekdayDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** "14 days left", "Due tomorrow", "Due today", "2 days overdue". */
export function countdownLabel(deadline: number | null, now = Date.now()): string | null {
  const left = daysLeft(deadline, now);
  if (left == null) return null;
  if (left > 1) return `${left} days left`;
  if (left === 1) return "Due tomorrow";
  if (left === 0) return "Due today";
  return `${-left} day${left === -1 ? "" : "s"} overdue`;
}

/** "Nov 11 · 14 days left" style tone for a deadline. */
export function deadlineTone(deadline: number | null, now = Date.now()) {
  const left = daysLeft(deadline, now);
  if (left == null) return "muted" as const;
  if (left < 0) return "late" as const;
  if (left <= 3) return "soon" as const;
  return "ok" as const;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
