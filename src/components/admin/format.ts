import { AR_EVENTS, type StoredEvent } from "@/lib/ar/events";

// Formatting for the /admin tools. Everything renders in the viewer's own
// locale and time zone.

/** "38s", "4m 12s", "1h 05m" */
export function formatDuration(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** Elapsed time on a journey: "+0:12", "+12:03", "+1:02:03" */
export function formatOffset(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h ? `+${h}:${String(m).padStart(2, "0")}:${sec}` : `+${m}:${sec}`;
}

const rtf =
  typeof Intl !== "undefined" ? new Intl.RelativeTimeFormat(undefined, { numeric: "auto" }) : null;

/** "just now", "5 min ago", "3 hours ago", "yesterday", "4 days ago", then a date */
export function relativeTime(ts: number, now = Date.now()): string {
  const diff = Math.max(0, now - ts);
  const min = Math.round(diff / 60_000);
  if (min < 1) return "just now";
  if (!rtf) return formatDateTime(ts);
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.round(h / 24);
  if (d < 14) return rtf.format(-d, "day");
  return formatDate(ts);
}

export function formatDateTime(ts: number): string {
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(d.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}),
  });
}

export function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function formatNumber(n: number): string {
  return n.toLocaleString();
}

/** "42%", or "–" when there is nothing to divide by */
export function pct(n: number, of: number): string {
  if (!of) return "–";
  const v = (n / of) * 100;
  return `${v > 0 && v < 1 ? "<1" : Math.round(v)}%`;
}

let regionNames: Intl.DisplayNames | null | undefined;
export function countryName(code: string | null | undefined): string {
  if (!code || code === "Unknown") return "Unknown";
  if (regionNames === undefined) {
    try {
      regionNames = new Intl.DisplayNames(undefined, { type: "region" });
    } catch {
      regionNames = null;
    }
  }
  try {
    return regionNames?.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

export function place(geo: { country: string | null; city: string | null }): string {
  if (!geo.country && !geo.city) return "Unknown";
  return [geo.city, geo.country ? countryName(geo.country) : null].filter(Boolean).join(", ");
}

// Events the tracker sends that aren't in AR_EVENTS (it adds them itself).
const EXTRA_EVENTS: Record<string, string> = {
  link_resolved: "Opened their personal link",
};

export function humanize(name: string): string {
  const s = name.replace(/[_-]+/g, " ").trim();
  return s ? s[0].toUpperCase() + s.slice(1) : name;
}

export function eventLabel(n: string): string {
  return (AR_EVENTS as Record<string, string>)[n] ?? EXTRA_EVENTS[n] ?? humanize(n);
}

const fmtValue = (v: unknown) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));

/** The one line of context worth showing under an event, e.g. the product's name. */
export function eventDetail(e: StoredEvent): string | null {
  const p = e.p ?? {};
  const s = (k: string) => {
    const v = p[k];
    return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
  };
  switch (e.n) {
    case "session_start": {
      const w = p.w,
        h = p.h;
      const size = typeof w === "number" && typeof h === "number" ? `${w}×${h} window` : null;
      return [size, p.touch ? "touch screen" : null].filter(Boolean).join(" · ") || null;
    }
    case "link_resolved":
      return s("name");
    case "tour_step": {
      const step = s("step");
      const title = s("title");
      return [step ? `Step ${step}` : null, title].filter(Boolean).join(": ") || null;
    }
    case "tour_finish":
      return null;
    case "tour_skip":
      return s("step") ? `At step ${s("step")}` : null;
    case "game_end":
      return s("score") ? `Score ${s("score")}` : null;
  }
  // the thing the event is about (product, theme…) leads; an id stands in for a missing name
  const id = s("id");
  const main = s("label") ?? s("name") ?? s("title") ?? (id ? humanize(id) : null);
  const rest = Object.entries(p)
    .filter(([k, v]) => v !== null && v !== "" && !["label", "name", "title", "id"].includes(k))
    .map(([k, v]) => `${humanize(k).toLowerCase()}: ${fmtValue(v)}`);
  return [main, ...rest].filter(Boolean).join(" · ") || null;
}

export function deviceLabel(d: { mobile: boolean; os: string; browser?: string }): string {
  return `${d.mobile ? "Mobile" : "Desktop"} · ${d.os}${d.browser && d.browser !== "Other" ? ` · ${d.browser}` : ""}`;
}

/** Copy text; falls back to a hidden textarea where the async clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function isUnauthorized(err: unknown): boolean {
  return err instanceof Error && /unauthori[sz]ed/i.test(err.message);
}
