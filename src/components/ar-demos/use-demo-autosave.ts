import { useCallback, useEffect, useRef, useState } from "react";

import type { DemoContent, DemoContentDoc } from "@/lib/ar/demo-content";
import type { DemoId } from "@/lib/ar/demo-tours";

// Autosave for a live demo's draft, like the endcap builder's: ~800 ms after the
// last edit, one request at a time, always the newest draft; a failed save keeps
// the edits and retries; closing the tab sends the last save with keepalive.

export type DemoSaveStatus = "saved" | "saving" | "error" | "conflict" | "signed-out";

async function put(
  demo: DemoId,
  draft: DemoContent,
  base: number,
  keepalive = false,
  force = false,
) {
  const body = JSON.stringify({ draft, base, force });
  const res = await fetch(`/api/ar/demo-content/${demo}`, {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json", "x-ar-admin": "1" },
    body,
    keepalive: keepalive && body.length < 60_000,
  });
  const json = (await res.json().catch(() => null)) as
    { ok: true; doc: DemoContentDoc } | { ok: false; error: string; message?: string } | null;
  return { status: res.status, json };
}

export function useDemoAutosave(opts: {
  demo: DemoId;
  draft: DemoContent;
  updatedAt: number;
  onSaved: (doc: DemoContentDoc) => void;
}) {
  const { demo, draft } = opts;
  const [status, setStatus] = useState<DemoSaveStatus>("saved");
  const latest = useRef(draft);
  const saved = useRef(draft);
  const base = useRef(opts.updatedAt);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const running = useRef<Promise<boolean> | null>(null);
  const blocked = useRef(false);
  const onSaved = useRef(opts.onSaved);
  onSaved.current = opts.onSaved;
  const dirty = () => latest.current !== saved.current;

  const run = useCallback(
    (force = false): Promise<boolean> => {
      if (running.current) return running.current.then(() => (dirty() ? run(force) : true));
      const p = (async () => {
        while (dirty()) {
          const snapshot = latest.current;
          setStatus("saving");
          let r: Awaited<ReturnType<typeof put>>;
          try {
            r = await put(demo, snapshot, base.current, false, force);
          } catch {
            setStatus("error");
            return false;
          }
          force = false;
          if (r.status === 200 && r.json?.ok) {
            base.current = r.json.doc.updatedAt;
            saved.current = snapshot;
            onSaved.current(r.json.doc);
            continue;
          }
          blocked.current = r.status === 409 || r.status === 401;
          setStatus(r.status === 409 ? "conflict" : r.status === 401 ? "signed-out" : "error");
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
    [demo],
  );

  useEffect(() => {
    latest.current = draft;
    if (!dirty() || blocked.current) return;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void run(), 800);
  }, [draft, run]);

  useEffect(() => {
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (!dirty() && !running.current) return;
      if (!blocked.current && dirty())
        void put(demo, latest.current, base.current, true).catch(() => {});
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [demo]);

  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return {
    status,
    flush: useCallback(async () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      if (blocked.current) return false;
      if (!dirty() && !running.current) return true;
      return run();
    }, [run]),
    retry: useCallback(() => {
      blocked.current = false;
      return run();
    }, [run]),
    overwrite: useCallback(() => {
      blocked.current = false;
      return run(true);
    }, [run]),
    /** the server's copy now matches `d` (after publish / reset) */
    markSaved: useCallback((d: DemoContent, updatedAt: number) => {
      latest.current = d;
      saved.current = d;
      base.current = updatedAt;
      blocked.current = false;
      setStatus("saved");
    }, []),
  };
}
