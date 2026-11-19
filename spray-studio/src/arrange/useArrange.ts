/**
 * Arrange mode's document: the scene of the piece on the stage, with undo / redo, the live stage kept in
 * step (paint/sceneItems.ts `SceneLayer.set`), and saving.
 *
 * Saving: shortly after the last change (and at once on `flush()`: leaving Arrange, another piece, the
 * page closing) the scene goes to PUT /api/spray/admin/sets/<id>/scene. The status says Saving / Saved /
 * Couldn't save; a failed save keeps the changes here and is retried with `retry()` or the next change.
 * A page closing with changes still unsaved sends them with a request that outlives the page, and asks
 * first when the last save failed. Scene edits are never sent to phones (realtime rooms).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { allSceneOf, getSceneLayer, type SceneItem } from '../paint/sceneItems';
import { PAINTABLE_OBJECTS, type SprayPaintable } from '../paint/objectCatalog';
import { saveSceneOnExit, saveSceneTo, type Asset } from './api';
import { clamp, defaultItem, newItemId, POS_LIMIT, round, SCENE_MAX_ITEMS } from './sceneMath';
import { useHistory } from './history';

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';
export type ArrangeTool = 'move' | 'rotate' | 'resize';

const SAVE_DELAY = 900;

/** Keeps the catalog's copy of the piece in step, so a rebuilt card shows the saved scene. */
function setCatalogScene(pid: string, scene: SceneItem[]) {
  for (const o of PAINTABLE_OBJECTS) if (o.paintable?.id === pid) o.paintable.scene = scene;
}

export function useArrange(meta: SprayPaintable | undefined, ready: boolean, showSelection: boolean) {
  const pid = meta?.id ?? null;
  const hist = useHistory<SceneItem[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tool, setTool] = useState<ArrangeTool>('move');
  const [snap, setSnap] = useState(true);
  const [, setInfoTick] = useState(0);

  const saved = useRef<{ pid: string | null; doc: SceneItem[] }>({ pid: null, doc: [] });
  const docRef = useRef(hist.doc);
  docRef.current = hist.doc;
  const pidRef = useRef<string | null>(null);
  const timer = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);

  const save = useCallback(async (): Promise<void> => {
    window.clearTimeout(timer.current);
    timer.current = 0;
    if (inflight.current) {
      await inflight.current;
      return save();
    }
    const p = pidRef.current;
    const doc = docRef.current;
    if (!p || saved.current.pid !== p || doc === saved.current.doc) return;
    setStatus('saving');
    setError(null);
    const run = saveSceneTo(p, doc)
      .then(() => {
        if (saved.current.pid === p) saved.current = { pid: p, doc };
        setCatalogScene(p, doc);
        if (pidRef.current === p) setStatus(docRef.current === doc ? 'saved' : 'pending');
        if (pidRef.current === p && docRef.current !== doc) timer.current = window.setTimeout(() => void save(), SAVE_DELAY);
      })
      .catch((e: Error) => {
        if (pidRef.current !== p) return;
        setStatus('error');
        setError(e.message || 'Couldn’t save.');
      });
    inflight.current = run.finally(() => {
      inflight.current = null;
    });
    await inflight.current;
  }, []);

  // a new piece: send what is left of the last one, then start from this one's saved scene
  useEffect(() => {
    if (!pid || !meta) return;
    const prev = saved.current;
    if (prev.pid && prev.pid !== pid && docRef.current !== prev.doc) {
      const left = docRef.current;
      const prevPid = prev.pid;
      void saveSceneTo(prevPid, left)
        .then(() => setCatalogScene(prevPid, left))
        .catch((e) => console.warn('[arrange] last piece not saved', e));
    }
    window.clearTimeout(timer.current);
    getSceneLayer(prev.pid ?? '')?.select(null);
    const doc = allSceneOf(meta);
    saved.current = { pid, doc };
    pidRef.current = pid;
    docRef.current = doc;
    hist.reset(doc);
    setSelected(null);
    setStatus('idle');
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid]);

  // a change: save shortly after the last one
  useEffect(() => {
    const s = saved.current;
    if (!pid || s.pid !== pid) return;
    if (hist.doc === s.doc) {
      window.clearTimeout(timer.current);
      timer.current = 0;
      setStatus((st) => (st === 'pending' ? 'saved' : st));
      return;
    }
    setStatus((st) => (st === 'saving' ? st : 'pending'));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY);
  }, [hist.doc, pid, save]);

  // the live stage follows the document (in place); the card may have been rebuilt meanwhile (`ready`)
  useEffect(() => {
    if (!pid) return;
    const layer = getSceneLayer(pid);
    if (!layer) return;
    layer.onInfo = () => setInfoTick((t) => t + 1);
    layer.set(hist.doc);
    layer.select(showSelection ? selected : null);
  }, [hist.doc, pid, ready, selected, showSelection]);

  useEffect(() => {
    if (selected && !hist.doc.some((it) => it.id === selected)) setSelected(null);
  }, [hist.doc, selected]);

  // leaving the page: nothing unsaved is lost silently
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent | PageTransitionEvent) => {
      const p = pidRef.current;
      if (!p || saved.current.pid !== p || docRef.current === saved.current.doc) return;
      saveSceneOnExit(p, docRef.current);
      if (e.type === 'beforeunload') {
        e.preventDefault();
        (e as BeforeUnloadEvent).returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onLeave);
    window.addEventListener('pagehide', onLeave);
    return () => {
      window.removeEventListener('beforeunload', onLeave);
      window.removeEventListener('pagehide', onLeave);
    };
  }, []);

  const layer = () => (pidRef.current ? getSceneLayer(pidRef.current) : undefined);
  const heightMm = meta?.heightMm && meta.heightMm > 0 ? meta.heightMm : 100;

  const commit = useCallback(
    (items: SceneItem[], merge?: string) => {
      docRef.current = items; // several changes in one go each build on the last
      hist.set(items, merge);
    },
    [hist],
  );
  const update = (id: string, next: SceneItem, merge?: string) =>
    commit(
      docRef.current.map((it) => (it.id === id ? next : it)),
      merge,
    );

  /** Adds a library asset (at `at`, mm on the print, or the middle). Returns the new item, or null when full. */
  const add = (asset: Asset, at?: [number, number]): SceneItem | null => {
    if (docRef.current.length >= SCENE_MAX_ITEMS) return null;
    const info = {
      box: asset.dims ? { w: asset.dims[0], h: asset.dims[1], d: asset.dims[2] } : undefined,
      clips: asset.clips,
      tris: asset.tris ?? undefined,
    };
    layer()?.setInfo(asset.file, info);
    const item = defaultItem(asset.kind, asset.file, asset.name, heightMm, { ...info, aspect: asset.aspect }, at);
    commit([...docRef.current, item]);
    setSelected(item.id);
    return item;
  };

  const remove = (id: string) => commit(docRef.current.filter((it) => it.id !== id));

  const duplicate = (id: string) => {
    const it = docRef.current.find((x) => x.id === id);
    if (!it || docRef.current.length >= SCENE_MAX_ITEMS) return;
    const copy: SceneItem = {
      ...it,
      id: newItemId(),
      name: `${it.name} copy`.slice(0, 80),
      pos: [clamp(round(it.pos[0] + 10, 0.1), -POS_LIMIT, POS_LIMIT), it.pos[1], it.pos[2]],
    };
    commit([...docRef.current, copy]);
    setSelected(copy.id);
  };

  /** After the library deleted a file everywhere: take it off here too, with nothing to undo back to it. */
  const dropFile = (file: string) => {
    const next = docRef.current.filter((it) => it.file !== file);
    if (next.length === docRef.current.length) return;
    if (pidRef.current) {
      saved.current = { pid: pidRef.current, doc: next };
      setCatalogScene(pidRef.current, next);
    }
    docRef.current = next;
    hist.reset(next);
  };

  return {
    pid,
    heightMm,
    items: hist.doc,
    selected,
    select: setSelected,
    selectedItem: hist.doc.find((it) => it.id === selected) ?? null,
    commit,
    update,
    add,
    remove,
    duplicate,
    dropFile,
    undo: hist.undo,
    redo: hist.redo,
    canUndo: hist.canUndo,
    canRedo: hist.canRedo,
    full: hist.doc.length >= SCENE_MAX_ITEMS,
    status,
    error,
    flush: save,
    retry: () => void save(),
    tool,
    setTool,
    snap,
    setSnap,
    /** The live stage without a history step (a drag in progress). */
    preview: (items: SceneItem[]) => layer()?.set(items),
    dims: (it: SceneItem) => layer()?.dims(it) ?? { w: it.size, h: it.size, d: 0 },
    info: (file: string) => layer()?.info.get(file),
  };
}

export type ArrangeApi = ReturnType<typeof useArrange>;
