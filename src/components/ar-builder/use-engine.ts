import { useCallback, useEffect, useRef, useState } from "react";

import { publicProject, type Project } from "@/lib/ar/project";

// The builder side of the engine protocol (v1): the preview iframe runs
// /activated-retail/engine/?preview=1 (public/activated-retail/engine/index.html)
// and talks to us with postMessage, same origin only.
//   → ar:project, ar:goto, ar:tour, ar:export, ar:thumb
//   ← ar:ready, ar:loaded, ar:applied, ar:state, ar:error, ar:export:done|error, ar:thumb:done

// index.html spelled out: the dev server's router redirects "/engine/" to "/engine"
// (a 404 there), while Netlify serves either form
export const ENGINE_PREVIEW_URL = "/activated-retail/engine/index.html?preview=1";

export type EngineStatus = "loading" | "ready" | "loaded" | "unavailable";
export interface EngineState {
  theme?: string;
  view?: string;
  zone?: string | null;
}

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const READY_TIMEOUT_MS = 20000;
const SEND_DEBOUNCE_MS = 300;

export function useEngine(opts: {
  onState?: (s: EngineState) => void;
  onError?: (message: string) => void;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatus] = useState<EngineStatus>("loading");
  const [applyError, setApplyError] = useState<string | null>(null);
  const statusRef = useRef<EngineStatus>("loading");
  const project = useRef<Project | null>(null);
  const sendTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef(new Map<string, Pending>());
  const handlers = useRef(opts);
  handlers.current = opts;

  const setStat = (s: EngineStatus) => {
    statusRef.current = s;
    setStatus(s);
  };

  const post = useCallback((msg: unknown) => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return false;
    w.postMessage(msg, window.location.origin);
    return true;
  }, []);

  const flushProject = useCallback(() => {
    if (sendTimer.current) clearTimeout(sendTimer.current);
    sendTimer.current = null;
    // the plain password never needs to reach the page
    if (project.current) post({ type: "ar:project", project: publicProject(project.current) });
  }, [post]);

  /** Queue the latest project; sent ~300 ms after the last change. */
  const setProject = useCallback(
    (p: Project) => {
      project.current = p;
      if (statusRef.current === "loading" || statusRef.current === "unavailable") return;
      if (sendTimer.current) clearTimeout(sendTimer.current);
      sendTimer.current = setTimeout(flushProject, SEND_DEBOUNCE_MS);
    },
    [flushProject],
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const m = e.data as { type?: string; [k: string]: unknown };
      if (!m || typeof m.type !== "string") return;
      switch (m.type) {
        case "ar:ready":
          // re-sent every 500 ms until a project arrives
          if (statusRef.current === "loading" || statusRef.current === "unavailable")
            setStat("ready");
          flushProject();
          break;
        case "ar:loaded":
          setStat("loaded");
          break;
        case "ar:applied":
          setApplyError(m.ok ? null : String(m.message ?? "The preview couldn't apply a change."));
          if (statusRef.current === "ready" && m.ok) setStat("loaded");
          break;
        case "ar:state":
          handlers.current.onState?.({
            theme: m.theme as string | undefined,
            view: m.view as string | undefined,
            zone: m.zone as string | null | undefined,
          });
          break;
        case "ar:error":
          handlers.current.onError?.(String(m.message ?? "Unknown problem"));
          break;
        case "ar:export:done":
        case "ar:export:error":
        case "ar:thumb:done": {
          const p = pending.current.get(String(m.id));
          if (!p) break;
          pending.current.delete(String(m.id));
          clearTimeout(p.timer);
          if (m.type === "ar:export:error")
            p.reject(new Error(String(m.message ?? "Export failed")));
          else p.resolve(m);
          break;
        }
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [flushProject]);

  // the engine never said hello: missing page, script error, very slow device
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      if (statusRef.current === "loading") setStat("unavailable");
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(
    () => () => {
      for (const p of pending.current.values()) {
        clearTimeout(p.timer);
        p.reject(new Error("The preview closed"));
      }
      if (sendTimer.current) clearTimeout(sendTimer.current);
    },
    [],
  );

  const request = useCallback(
    <T>(msg: Record<string, unknown>, timeoutMs: number): Promise<T> => {
      if (statusRef.current !== "ready" && statusRef.current !== "loaded") {
        return Promise.reject(new Error("The preview isn't ready yet"));
      }
      const id = Math.random().toString(36).slice(2);
      return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.current.delete(id);
          reject(new Error("The preview took too long to answer"));
        }, timeoutMs);
        pending.current.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
        flushProject(); // export what's on screen now, not 300 ms ago
        if (!post({ ...msg, id })) {
          clearTimeout(timer);
          pending.current.delete(id);
          reject(new Error("The preview isn't open"));
        }
      });
    },
    [flushProject, post],
  );

  return {
    iframeRef,
    status,
    applyError,
    setProject,
    goto: useCallback(
      (o: { view?: string; theme?: string; zone?: string | null }) =>
        post({ type: "ar:goto", ...o }),
      [post],
    ),
    tour: useCallback((play: boolean) => post({ type: "ar:tour", play }), [post]),
    exportAR: useCallback(
      async (theme: string) => {
        const r = await request<{ glb: ArrayBuffer; usdz: ArrayBuffer }>(
          { type: "ar:export", theme },
          180000,
        );
        if (!(r.glb instanceof ArrayBuffer) || !(r.usdz instanceof ArrayBuffer)) {
          throw new Error("The preview sent back empty AR files");
        }
        return { glb: r.glb, usdz: r.usdz };
      },
      [request],
    ),
    thumb: useCallback(
      async (width = 640) =>
        (await request<{ dataUrl: string }>({ type: "ar:thumb", width }, 30000)).dataUrl,
      [request],
    ),
    reload: useCallback(() => {
      setStat("loading");
      setApplyError(null);
      const f = iframeRef.current;
      if (f) f.src = `${ENGINE_PREVIEW_URL}&r=${Date.now().toString(36)}`;
    }, []),
  };
}

export type Engine = ReturnType<typeof useEngine>;
