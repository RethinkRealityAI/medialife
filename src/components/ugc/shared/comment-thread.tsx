/**
 * A submission's feedback thread: MEDIALIFE on one side, the creator on the
 * other, newest last, with a reply box. `viewer` decides which side is "you".
 * The creator app and the admin review page both use it.
 */
import { useId, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { toast } from "sonner";

import { UGC, type UgcComment } from "@/lib/ugc/model";
import { cn } from "@/lib/utils";

import { dayDate } from "./format";
import { btnIcon, textarea } from "./look";

export function CommentThread({
  comments,
  viewer,
  onPost,
  placeholder = "Reply…",
  disabled,
  className,
  emptyText,
}: {
  comments: UgcComment[];
  viewer: "creator" | "medialife";
  /** Returns an error message, or null when it posted. */
  onPost?: (body: string) => Promise<string | null>;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  emptyText?: string;
}) {
  const id = useId();
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const text = body.trim();
    if (!text || !onPost || busy) return;
    setBusy(true);
    setError(null);
    try {
      const err = await onPost(text);
      if (err) setError(err);
      else setBody("");
    } catch {
      setError("Couldn't send. Check your connection and try again.");
      toast.error("Couldn't send your message.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={cn("min-w-0", className)}>
      {comments.length ? (
        <ol className="space-y-3" aria-label="Feedback">
          {comments.map((c) => {
            const mine = c.author === viewer;
            const team = c.author === "medialife";
            return (
              <li key={c.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] min-w-0 rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                    mine
                      ? "rounded-br-md bg-[#3fe6e0]/[0.12] text-foreground ring-1 ring-[#3fe6e0]/25 ring-inset"
                      : "rounded-bl-md bg-white/[0.06] ring-1 ring-white/10 ring-inset",
                  )}
                >
                  <div className="mb-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                    <span className={cn("font-medium", team ? "text-[#ffe48a]" : "text-[#bff7f4]")}>
                      {team
                        ? !c.name || /^medialife$/i.test(c.name)
                          ? "MEDIALIFE"
                          : `${c.name} · MEDIALIFE`
                        : mine
                          ? "You"
                          : c.name}
                    </span>
                    <time dateTime={new Date(c.at).toISOString()} suppressHydrationWarning>
                      {dayDate(c.at)}
                    </time>
                  </div>
                  <p className="break-words whitespace-pre-wrap">{c.body}</p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : emptyText ? (
        <p className="text-sm text-muted-foreground">{emptyText}</p>
      ) : null}

      {onPost ? (
        <form onSubmit={send} className={cn("flex items-end gap-2", comments.length && "mt-3")}>
          <label htmlFor={id} className="sr-only">
            {placeholder}
          </label>
          <textarea
            id={id}
            rows={1}
            value={body}
            maxLength={UGC.maxCommentChars}
            disabled={disabled || busy}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void send();
            }}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? `${id}-err` : undefined}
            className={cn(textarea, "min-h-11 resize-none py-2.5 field-sizing-content max-h-40")}
          />
          <button
            type="submit"
            className={cn(btnIcon, "border-[#3fe6e0]/40 text-[#bff7f4]")}
            disabled={disabled || busy || !body.trim()}
            aria-label="Send"
          >
            {busy ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden />
            ) : (
              <SendHorizontal aria-hidden />
            )}
          </button>
        </form>
      ) : null}
      {error ? (
        <p id={`${id}-err`} role="alert" className="mt-1.5 text-sm text-red-300">
          {error}
        </p>
      ) : null}
    </div>
  );
}
