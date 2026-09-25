import { useCallback, useEffect, useRef, useState } from "react";

import type { Project } from "@/lib/ar/project";
import type { Issue, ProjectSummary } from "@/lib/ar/projects";

import { saveDraftRequest } from "./api";

// Draft autosave: ~800 ms after the last edit, one request at a time, always
// the latest draft. Nothing is dropped: a failed save keeps the edits and
// retries on the next change or on "Retry"; leaving the page flushes first.

export type SaveStatus = "saved" | "pending" | "saving" | "error" | "conflict" | "signed-out";

const DEBOUNCE_MS = 800;

export function useAutosave(opts: {
  slug: string;
  draft: Project;
  updatedAt: number;
  onSaved?: (r: { updatedAt: number; issues: Issue[]; summary: ProjectSummary }) => void;
}) {
  const { slug, draft } = opts;
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(draft);
  const saved = useRef(draft);
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
        // chain: once the current request lands, save whatever is newest
        return running.current.then(() => (dirty() ? run(force) : true));
      }
      const p = (async () => {
        while (dirty()) {
          const snapshot = latest.current;
          setStatus("saving");
          const r = await saveDraftRequest(slug, snapshot, base.current, { force });
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
          if (r.error === "unauthorized") {
            blocked.current = true;
            setStatus("signed-out");
            return false;
          }
          setError(r.message);
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

  // schedule a save for every change after the first render
  useEffect(() => {
    latest.current = draft;
    if (!dirty()) return;
    if (blocked.current) return;
    setStatus((s) => (s === "saving" ? s : "pending"));
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), DEBOUNCE_MS);
  }, [draft, run]);

  /** Save now (before publishing or leaving). Resolves true when everything is stored. */
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (blocked.current) return false;
    if (!dirty() && !running.current) return true;
    return run();
  }, [run]);

  // closing the tab: send the last draft with keepalive and ask the browser to confirm
  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty() && !running.current) return;
      if (!blocked.current && dirty()) {
        void saveDraftRequest(slug, latest.current, base.current, { keepalive: true });
      }
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [slug]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return {
    status,
    error,
    isDirty: dirty,
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
    markSaved: useCallback((p: Project, updatedAt: number) => {
      latest.current = p;
      saved.current = p;
      base.current = updatedAt;
      blocked.current = false;
      setStatus("saved");
    }, []),
  };
}
