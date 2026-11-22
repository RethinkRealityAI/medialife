// A tiny external store (zustand-style) so voice / experience events, which arrive outside React, can update
// state without stale closures. Components read slices with `useStore(store, selector)`.
import { useSyncExternalStore, useRef } from 'react';

export interface Store<S> {
  get(): S;
  set(patch: Partial<S> | ((s: S) => Partial<S>)): void;
  subscribe(cb: () => void): () => void;
}

export function createStore<S extends object>(initial: S): Store<S> {
  let state = initial;
  const subs = new Set<() => void>();
  return {
    get: () => state,
    set(patch) {
      const next = typeof patch === 'function' ? patch(state) : patch;
      let changed = false;
      for (const k of Object.keys(next) as (keyof S)[]) {
        if (!Object.is(state[k], next[k])) { changed = true; break; }
      }
      if (!changed) return;
      state = { ...state, ...next };
      subs.forEach((cb) => cb());
    },
    subscribe(cb) {
      subs.add(cb);
      return () => { subs.delete(cb); };
    },
  };
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a as object);
  const kb = Object.keys(b as object);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

/** Read a slice. Selectors may return a fresh object/array: results are compared shallowly. */
export function useStore<S, T>(store: Store<S>, selector: (s: S) => T): T {
  const last = useRef<{ value: T } | null>(null);
  const getSnapshot = () => {
    const next = selector(store.get());
    if (last.current && shallowEqual(last.current.value, next)) return last.current.value;
    last.current = { value: next };
    return next;
  };
  return useSyncExternalStore(store.subscribe, getSnapshot, getSnapshot);
}
