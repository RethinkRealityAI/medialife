import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Plays alerts one at a time: each one enters, holds for `holdMs`, exits over
 * `exitMs`, then the next starts. One timer at a time, cleared on unmount, and
 * the queue is capped so a burst of orders can't pile up for minutes.
 */

export type AlertPhase = "in" | "out";

export type QueueState<T> = {
  current: T | null;
  phase: AlertPhase;
  queue: T[];
};

const CAP = 8;

export function useAlertQueue<T extends { key: string }>({
  holdMs = 5200,
  exitMs = 600,
  gapMs = 250,
}: { holdMs?: number; exitMs?: number; gapMs?: number } = {}) {
  const [state, setState] = useState<QueueState<T>>({ current: null, phase: "in", queue: [] });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enqueue = useCallback((items: T[]) => {
    if (!items.length) return;
    setState((s) => {
      const queue = [...s.queue, ...items];
      // Keep the newest: on a flood, older alerts make way.
      return { ...s, queue: queue.length > CAP ? queue.slice(queue.length - CAP) : queue };
    });
  }, []);

  const clearAll = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setState({ current: null, phase: "in", queue: [] });
  }, []);

  const { current, phase } = state;
  const waiting = !current && state.queue.length > 0;

  useEffect(() => {
    const after = (ms: number, fn: () => void) => {
      timer.current = setTimeout(() => {
        timer.current = null;
        fn();
      }, ms);
    };
    if (waiting) {
      after(gapMs, () =>
        setState((s) =>
          s.current || !s.queue.length
            ? s
            : { current: s.queue[0], phase: "in", queue: s.queue.slice(1) },
        ),
      );
    } else if (current && phase === "in") {
      after(holdMs, () => setState((s) => ({ ...s, phase: "out" })));
    } else if (current && phase === "out") {
      after(exitMs, () => setState((s) => ({ ...s, current: null, phase: "in" })));
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
    };
    // `waiting`, not the queue length: an alert arriving mid-hold must not
    // restart the current alert's timer.
  }, [current, phase, waiting, holdMs, exitMs, gapMs]);

  return { ...state, enqueue, clearAll };
}
