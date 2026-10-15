import { useCallback, useEffect, useRef, useState } from "react";

import type { ShelfConfig, ShelfPreviewMessage } from "@/lib/shelf/config";
import { SHELF_PREVIEW_URL } from "@/lib/shelf/shelves";

// The live preview: the real shelf page (public/merch-shelf/index.html?preview=1)
// in a same-origin iframe, driven over postMessage (ShelfPreviewMessage in
// src/lib/shelf/config.ts):
//   → shelf:config {config}          on every change, debounced
//   → shelf:snapshot {width,height}  on publish, for the og:image
//   ← shelf:ready                    the page is listening (we answer with the config)
//   ← shelf:snapshot-result {dataUrl}

export type PreviewStatus = "loading" | "ready" | "unavailable";

const READY_TIMEOUT_MS = 20_000;
const SEND_DEBOUNCE_MS = 250;
const SNAPSHOT_TIMEOUT_MS = 20_000;

export function useShelfPreview() {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [status, setStatusState] = useState<PreviewStatus>("loading");
  const statusRef = useRef<PreviewStatus>("loading");
  const config = useRef<ShelfConfig | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const snapshotWaiters = useRef<Array<(dataUrl: string | null) => void>>([]);
  /** how many configs were posted, for the "in sync" hint and tests */
  const [sent, setSent] = useState(0);

  const setStatus = (s: PreviewStatus) => {
    statusRef.current = s;
    setStatusState(s);
  };

  const post = useCallback((msg: ShelfPreviewMessage) => {
    const w = iframeRef.current?.contentWindow;
    if (!w) return false;
    w.postMessage(msg, window.location.origin);
    return true;
  }, []);

  const flush = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (config.current && post({ type: "shelf:config", config: config.current })) {
      setSent((n) => n + 1);
    }
  }, [post]);

  /** Queue the latest valid config; posted ~250 ms after the last change. */
  const setConfig = useCallback(
    (c: ShelfConfig) => {
      config.current = c;
      if (statusRef.current !== "ready") return; // sent on shelf:ready
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SEND_DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (e.origin !== window.location.origin) return;
      if (!iframeRef.current || e.source !== iframeRef.current.contentWindow) return;
      const m = e.data as Partial<ShelfPreviewMessage> | null;
      if (!m || typeof m.type !== "string") return;
      if (m.type === "shelf:ready") {
        setStatus("ready");
        flush();
      } else if (m.type === "shelf:snapshot-result") {
        const dataUrl =
          typeof m.dataUrl === "string" && m.dataUrl.startsWith("data:image/") ? m.dataUrl : null;
        const waiters = snapshotWaiters.current.splice(0);
        for (const w of waiters) w(dataUrl);
      }
    }
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [flush]);

  // the page never said hello: missing page, script error, very slow device
  useEffect(() => {
    if (status !== "loading") return;
    const t = setTimeout(() => {
      if (statusRef.current === "loading") setStatus("unavailable");
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [status]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      for (const w of snapshotWaiters.current.splice(0)) w(null);
    },
    [],
  );

  /** A PNG/JPEG data URL of the hero view, or null when the page can't (or won't) answer. */
  const snapshot = useCallback(
    (width = 1200, height = 630): Promise<string | null> => {
      if (statusRef.current !== "ready") return Promise.resolve(null);
      flush(); // capture what's on screen now, not 250 ms ago
      return new Promise((resolve) => {
        let done = false;
        const finish = (v: string | null) => {
          if (done) return;
          done = true;
          clearTimeout(t);
          snapshotWaiters.current = snapshotWaiters.current.filter((w) => w !== finish);
          resolve(v);
        };
        const t = setTimeout(() => finish(null), SNAPSHOT_TIMEOUT_MS);
        snapshotWaiters.current.push(finish);
        // give the page a frame to apply the config it was just sent
        setTimeout(() => {
          if (!post({ type: "shelf:snapshot", width, height })) finish(null);
        }, 300);
      });
    },
    [flush, post],
  );

  const reload = useCallback(() => {
    setStatus("loading");
    const f = iframeRef.current;
    if (f) f.src = `${SHELF_PREVIEW_URL}&r=${Date.now().toString(36)}`;
  }, []);

  return { iframeRef, status, sent, setConfig, snapshot, reload };
}

export type ShelfPreview = ReturnType<typeof useShelfPreview>;
