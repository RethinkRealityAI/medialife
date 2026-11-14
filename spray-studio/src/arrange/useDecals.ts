/**
 * The decals on this painting (they belong to the creation, not the piece): undo / redo, the selected
 * one, the card's decal layer kept in step, and placing a new one the way the AR page does. Cleared with
 * the paint (Clear, another piece, Paint another, a kiosk reset). Never sent to phones.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { SprayPaintable } from '../paint/objectCatalog';
import { useHistory } from './history';
import { getDecalLayer, loadDecalLibrary, maskCentre, MAX_DECALS, placeDecal, type Decal, type DecalDef, type DecalLibrary } from './decals';

export function useDecals(meta: SprayPaintable | undefined, ready: boolean, showSelection: boolean) {
  const pid = meta?.id ?? null;
  const hist = useHistory<Decal[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [library, setLibrary] = useState<DecalLibrary | null>(null);
  const [libError, setLibError] = useState(false);
  const docRef = useRef(hist.doc);
  docRef.current = hist.doc;
  const lastPid = useRef<string | null>(null);

  const loadLibrary = useCallback(() => {
    setLibError(false);
    loadDecalLibrary()
      .then(setLibrary)
      .catch(() => setLibError(true));
  }, []);
  useEffect(loadLibrary, [loadLibrary]);

  // a new piece starts with no decals
  useEffect(() => {
    if (lastPid.current && lastPid.current !== pid) getDecalLayer(lastPid.current)?.set([], null);
    lastPid.current = pid;
    hist.reset([]);
    setSelected(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  useEffect(() => {
    if (!pid) return;
    getDecalLayer(pid)?.set(hist.doc, showSelection ? selected : null);
  }, [hist.doc, selected, pid, ready, showSelection, library]);

  useEffect(() => {
    if (selected != null && selected >= hist.doc.length) setSelected(null);
  }, [hist.doc, selected]);

  const commit = useCallback(
    (list: Decal[], merge?: string) => {
      docRef.current = list;
      hist.set(list, merge);
    },
    [hist],
  );

  /** Sticks a decal on: at `at` (picture uv) or where the AR page would put it. */
  const add = async (def: DecalDef, at?: [number, number]): Promise<'ok' | 'full' | 'not-ready'> => {
    if (!meta || !library) return 'not-ready';
    const centre = await maskCentre(meta.files.mask);
    const list = docRef.current;
    const { decal, swap } = placeDecal(def, list, library.by, meta.id, centre, at);
    if (swap >= 0) {
      const next = list.slice();
      next[swap] = decal;
      commit(next);
      setSelected(swap);
      return 'ok';
    }
    if (list.length >= MAX_DECALS) return 'full';
    commit([...list, decal]);
    setSelected(list.length);
    return 'ok';
  };

  const change = (i: number, patch: Partial<Decal>, merge?: string) =>
    commit(
      docRef.current.map((d, j) => (j === i ? { ...d, ...patch } : d)),
      merge,
    );
  const remove = (i: number) => {
    commit(docRef.current.filter((_, j) => j !== i));
    setSelected(null);
  };
  const toFront = (i: number) => {
    const list = docRef.current;
    if (i === list.length - 1) return;
    commit([...list.filter((_, j) => j !== i), list[i]]);
    setSelected(list.length - 1);
  };
  const flip = (i: number) => change(i, { f: docRef.current[i].f === 1 ? -1 : 1 });
  /** No decals, nothing to undo (with the paint). */
  const clear = () => {
    hist.reset([]);
    setSelected(null);
  };

  return {
    pid,
    list: hist.doc,
    selected,
    select: setSelected,
    library,
    libError,
    retryLibrary: loadLibrary,
    full: hist.doc.length >= MAX_DECALS,
    add,
    change,
    commit,
    remove,
    toFront,
    flip,
    clear,
    undo: hist.undo,
    redo: hist.redo,
    canUndo: hist.canUndo,
    canRedo: hist.canRedo,
    preview: (list: Decal[]) => (pid ? getDecalLayer(pid)?.set(list, selected) : undefined),
  };
}

export type DecalsApi = ReturnType<typeof useDecals>;
