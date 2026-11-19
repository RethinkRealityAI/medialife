import { useCallback, useReducer } from "react";

// Undo / redo for the editor's document. Changes with the same `merge` key that follow each other
// within a moment (typing in a number box, nudging with the arrow keys) become one step.

type State<T> = { past: T[]; present: T; future: T[]; mergeKey: string | null; at: number };
type Action<T> =
  | { type: "set"; next: T; merge?: string }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "reset"; doc: T };

const LIMIT = 100;
const MERGE_MS = 1200;

function reducer<T>(s: State<T>, a: Action<T>): State<T> {
  switch (a.type) {
    case "set": {
      if (a.next === s.present) return s;
      const now = Date.now();
      if (a.merge && a.merge === s.mergeKey && now - s.at < MERGE_MS)
        return { ...s, present: a.next, future: [], at: now };
      return {
        past: [...s.past, s.present].slice(-LIMIT),
        present: a.next,
        future: [],
        mergeKey: a.merge ?? null,
        at: now,
      };
    }
    case "undo":
      if (!s.past.length) return s;
      return {
        past: s.past.slice(0, -1),
        present: s.past[s.past.length - 1],
        future: [s.present, ...s.future],
        mergeKey: null,
        at: 0,
      };
    case "redo":
      if (!s.future.length) return s;
      return {
        past: [...s.past, s.present],
        present: s.future[0],
        future: s.future.slice(1),
        mergeKey: null,
        at: 0,
      };
    case "reset":
      return { past: [], present: a.doc, future: [], mergeKey: null, at: 0 };
  }
}

export function useHistory<T>(initial: T) {
  const [s, dispatch] = useReducer(reducer<T>, {
    past: [],
    present: initial,
    future: [],
    mergeKey: null,
    at: 0,
  } as State<T>);
  const set = useCallback((next: T, merge?: string) => dispatch({ type: "set", next, merge }), []);
  const undo = useCallback(() => dispatch({ type: "undo" }), []);
  const redo = useCallback(() => dispatch({ type: "redo" }), []);
  return {
    doc: s.present,
    set,
    undo,
    redo,
    canUndo: s.past.length > 0,
    canRedo: s.future.length > 0,
  };
}
