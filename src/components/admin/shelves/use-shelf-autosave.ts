import { useCallback, useEffect, useRef, useState } from "react";

import type { ShelfConfig } from "@/lib/shelf/config";
import { saveShelfDraftFn } from "@/lib/shelf/shelves.functions";
import type { ShelfSummary } from "@/lib/shelf/shelves";

// Draft autosave for the shelf editor: ~800 ms after the last valid edit, one
// request at a time, always the newest draft. An invalid draft (an empty sign
// name, say) isn't sent; it waits until it's fixed. A save that fails keeps the
// edits and retries on the next change or on "Retry"; leaving flushes first.

export type ShelfSaveStatus =
  "saved" | "pending" | "saving" | "invalid" | "error" | "conflict" | "signed-out";

const DEBOUNCE_MS = 800;

export function useShelfAutosave(opts: {
  slug: string;
  draft: ShelfConfig;
  valid: boolean;
  updatedAt: number;
  onSaved?: (r: { updatedAt: number; summary: ShelfSummary }) => void;
}) {
  const { slug, draft, valid } = opts;
  const [status, setStatus] = useState<ShelfSaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(draft);
  const saved = useRef(draft);
  const isValid = useRef(valid);
  const base = useRef(opts.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false); // conflict / signed out: wait for the user
  const onSaved = useRef(opts.onSaved);
  onSaved.current = opts.onSaved;

  const dirty = () => latest.current !== saved.current;

  const run = useCallback(
    (force = false): Promise<boolean> => {
      if (running.current) {
        return running.current.then(() => (dirty() && isValid.current ? run(force) : !dirty()));
      }
      const p = (async () => {
        while (dirty()) {
          if (!isValid.current) {
            setStatus("invalid");
            return false;
          }
          const snapshot = latest.current;
          setStatus("saving");
          let r: Awaited<ReturnType<typeof saveShelfDraftFn>>;
          try {
            r = await saveShelfDraftFn({
              data: { slug, draft: snapshot, base: base.current, force },
            });
          } catch (e) {
            const msg = e instanceof Error ? e.message : "";
            if (/unauthori[sz]ed/i.test(msg)) {
              blocked.current = true;
              setStatus("signed-out");
              return false;
            }
            setError("Couldn't reach the server.");
            setStatus("error");
            return false;
          }
          force = false;
          if (r.ok) {
            base.current = r.updatedAt;
            saved.current = snapshot;
            setError(null);
            onSaved.current?.(r);
            continue;
          }
          if (r.error === "conflict") {
            blocked.current = true;
            setStatus("conflict");
            return false;
          }
          setError(
            r.error === "not-found"
              ? "This shelf was deleted."
              : "The server refused this draft. Check the highlighted fields.",
          );
          setStatus("error");
          return false;
        }
        setStatus("saved");
        return true;
      })();
      running.current = p;
      p.finally(() => {
        if (running.current === p) running.current = null;
      });
      return p;
    },
    [slug],
  );

  useEffect(() => {
    latest.current = draft;
    isValid.current = valid;
    if (!dirty()) {
      setStatus((s) => (s === "invalid" || s === "pending" ? "saved" : s));
      return;
    }
    if (blocked.current) return;
    if (timer.current) clearTimeout(timer.current);
    if (!valid) {
      setStatus("invalid");
      return;
    }
    setStatus((s) => (s === "saving" ? s : "pending"));
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
  }, [draft, valid, run]);

  /** Save now (before publishing or leaving). Resolves true when everything is stored. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (blocked.current) return false;
    if (!dirty() && !running.current) return true;
    return run();
  }, [run]);

  // closing the tab with unsaved edits: ask the browser to confirm
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty() && !running.current) return;
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return {
    status,
    error,
    flush,
    retry: useCallback(() => {
      blocked.current = false;
      return run();
    }, [run]),
    /** After a conflict: store this tab's draft over the other one. */
    overwrite: useCallback(() => {
      blocked.current = false;
      return run(true);
    }, [run]),
    /** After publish / rename: the server's copy now matches `draft`. */
    markSaved: useCallback((c: ShelfConfig, updatedAt: number) => {
      latest.current = c;
      saved.current = c;
      base.current = updatedAt;
      blocked.current = false;
      setStatus("saved");
    }, []),
    /** The server's updatedAt moved for a reason of our own (label rename). */
    setBase: useCallback((updatedAt: number) => {
      base.current = updatedAt;
    }, []),
  };
}
