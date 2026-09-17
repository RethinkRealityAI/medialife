/**
 * One thread per property.
 *
 * Approvals and asset handovers happen in email today, which is why nobody can
 * ever find the version that was approved. Here the file is attached to the
 * message that needed it, and the message names the requirement it is about.
 *
 * The composer posts locally so a reviewer can actually use it in the demo —
 * nothing is sent anywhere.
 */
import { useState } from "react";
import { Paperclip, Send } from "lucide-react";

import { Panel, Pill } from "@/components/portal/kit";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { ACTIVE, type Comment, type CommentAuthor } from "@/lib/roblox-portal";

const AUTHOR = {
  creator: { mark: "border-accent/45 bg-accent/12 text-accent", tone: "accent" },
  medialife: { mark: "border-primary/45 bg-primary/12 text-primary", tone: "primary" },
  system: { mark: "border-border bg-white/[0.03] text-muted-foreground", tone: "muted" },
} as const;

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Entry({ c }: { c: Comment }) {
  const a = AUTHOR[c.author as CommentAuthor];
  return (
    <li className="flex gap-3.5 px-4 py-4">
      <span
        className={cn(
          "mono mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border text-[10px] font-semibold",
          a.mark,
        )}
        aria-hidden
      >
        {initials(c.name)}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <span className="text-sm font-medium">{c.name}</span>
          <span className="mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase">
            {c.role}
          </span>
          <span className="mono ml-auto text-[10px] tracking-[0.1em] text-muted-foreground uppercase">
            {c.when}
          </span>
        </div>

        {c.about ? (
          <div className="mt-1.5">
            <Pill tone="muted" dot={false}>
              Re: {c.about}
            </Pill>
          </div>
        ) : null}

        <p
          className={cn(
            "mt-2 max-w-2xl text-sm leading-relaxed",
            c.author === "system" ? "text-muted-foreground" : "text-foreground/90",
          )}
        >
          {c.body}
        </p>

        {c.attachments?.length ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {c.attachments.map((f) => (
              <span
                key={f.name}
                className="inline-flex max-w-full flex-wrap items-center gap-x-2 gap-y-0.5 rounded-md border border-border bg-white/[0.03] px-2.5 py-1.5"
              >
                <Paperclip className="size-3 shrink-0 text-muted-foreground" aria-hidden />
                <span className="min-w-0 break-all text-xs">{f.name}</span>
                <span className="mono text-[10px] tracking-[0.08em] text-muted-foreground uppercase">
                  {f.meta}
                </span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </li>
  );
}

export function Thread({ comments }: { comments: Comment[] }) {
  const [posted, setPosted] = useState<Comment[]>([]);
  const [draft, setDraft] = useState("");
  const [files, setFiles] = useState<string[]>([]);

  const all = [...comments, ...posted];

  function post() {
    const body = draft.trim();
    if (!body && !files.length) return;
    setPosted((p) => [
      ...p,
      {
        id: `local-${p.length}`,
        author: "creator",
        name: ACTIVE.studio,
        role: "You",
        when: "Just now",
        body: body || "Attached.",
        attachments: files.map((f) => ({ name: f, meta: "Pending upload" })),
      },
    ]);
    setDraft("");
    setFiles([]);
  }

  return (
    <Panel className="overflow-hidden">
      <ul className="divide-y divide-border">
        {all.map((c) => (
          <Entry key={c.id} c={c} />
        ))}
      </ul>

      <div className="border-t border-border bg-white/[0.02] p-4">
        <label htmlFor="thread-draft" className="sr-only">
          Add a comment
        </label>
        <Textarea
          id="thread-draft"
          rows={3}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Ask a question, approve something, or attach a file…"
          className="resize-none"
        />

        {files.length ? (
          <div className="mt-2.5 flex flex-wrap gap-2">
            {files.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFiles((x) => x.filter((n) => n !== f))}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-white/[0.03] px-2.5 py-1.5 text-xs hover:border-accent/50"
              >
                <Paperclip className="size-3 text-muted-foreground" aria-hidden />
                {f}
                <span aria-hidden className="text-muted-foreground">
                  ×
                </span>
                <span className="sr-only">Remove attachment</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <label className="mono inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-[10px] tracking-[0.12em] uppercase transition-colors hover:border-primary">
            <Paperclip className="size-3" aria-hidden /> Attach
            <input
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                const names = Array.from(e.target.files ?? []).map((f) => f.name);
                if (names.length) setFiles((x) => [...new Set([...x, ...names])]);
                e.target.value = "";
              }}
            />
          </label>

          <button
            type="button"
            onClick={post}
            disabled={!draft.trim() && !files.length}
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium text-white transition-transform enabled:hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: "var(--gradient-ember-btn)" }}
          >
            Post <Send className="size-3.5" aria-hidden />
          </button>
        </div>

        <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
          Demo mode — posts and attachments stay in this browser and are never uploaded.
        </p>
      </div>
    </Panel>
  );
}
