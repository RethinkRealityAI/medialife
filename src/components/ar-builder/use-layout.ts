import { useCallback, useEffect, useState } from "react";

// How the editor arranges settings and the live preview for the screen it's on.
//
//   side   landscape, ≥ 900 px wide: settings beside the preview (440 px panel from
//          1200 px, 380 px below that), and the panel can be collapsed
//   stack  portrait tablets and unfolded foldables (Galaxy Z Fold, iPad mini):
//          preview on top, settings below, a draggable divider between them
//   tabs   phones and fold cover screens (< 600 px wide, or very short): one pane
//          at a time with a Settings | Preview switch
//
// The preview iframe is heavy (a WebGL scene), so every layout keeps the same single
// iframe mounted in the same place in the DOM; only CSS changes, so rotating a
// foldable never reloads the scene.

export type EditorLayout = "side" | "stack" | "tabs";

export interface LayoutInfo {
  layout: EditorLayout;
  width: number;
  height: number;
  /** side layout: settings panel width */
  panelWidth: number;
  /** the vertical icon rail fits; otherwise a horizontal tab bar */
  rail: boolean;
  /** header: Library / Open preview / Share go into the overflow menu */
  compactHeader: boolean;
  /** header: phone width, icons only */
  tinyHeader: boolean;
}

export function layoutFor(width: number, height: number): LayoutInfo {
  const layout: EditorLayout =
    width < 600 || height < 520 ? "tabs" : width >= 900 && width > height ? "side" : "stack";
  const panelWidth = width >= 1200 ? 440 : 380;
  return {
    layout,
    width,
    height,
    panelWidth,
    rail: layout === "side" && panelWidth === 440,
    compactHeader: width < 1000,
    tinyHeader: width < 600,
  };
}

/** The window's size, or null before the first client render. */
export function useEditorLayout(): LayoutInfo | null {
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  useEffect(() => {
    let raf = 0;
    const read = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => setSize({ w: window.innerWidth, h: window.innerHeight }));
    };
    read();
    window.addEventListener("resize", read);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", read);
    };
  }, []);
  return size ? layoutFor(size.w, size.h) : null;
}

/** A remembered per-device UI preference (localStorage; falls back quietly). */
export function useStoredState<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const raw = window.localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (next: T) => {
      setV(next);
      try {
        window.localStorage.setItem(key, JSON.stringify(next));
      } catch {
        /* private mode: keep it for this visit */
      }
    },
    [key],
  );
  return [v, set] as const;
}

/**
 * When the on-screen keyboard opens over a field in `scroller`, scroll the field
 * back into view (Android Chrome only shrinks the visual viewport by default).
 */
export function useKeepFocusedFieldVisible(scroller: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || !scroller.current?.contains(el)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return;
      const r = el.getBoundingClientRect();
      if (r.bottom > vv.height + vv.offsetTop - 12 || r.top < vv.offsetTop) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    };
    vv.addEventListener("resize", onResize);
    return () => vv.removeEventListener("resize", onResize);
  }, [scroller]);
}
