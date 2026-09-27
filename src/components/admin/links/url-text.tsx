import { cn } from "@/lib/utils";

/**
 * A share URL on one line. When space runs out the host gives way first, then
 * the path; the ?c= code that identifies the client stays readable.
 */
export function UrlText({ url, className }: { url: string; className?: string }) {
  let host = "";
  let path = url;
  let query = "";
  try {
    const u = new URL(url);
    host = u.host;
    path = u.pathname;
    query = u.search;
  } catch {
    /* show it as is */
  }
  return (
    <span className={cn("mono flex min-w-0 overflow-hidden text-xs", className)} title={url}>
      {host ? (
        <span className="min-w-[3ch] shrink-[100] truncate text-muted-foreground">{host}</span>
      ) : null}
      <span className="min-w-[4ch] truncate text-muted-foreground">{path}</span>
      {query ? <span className="max-w-full shrink-0 truncate">{query}</span> : null}
    </span>
  );
}
