/**
 * The asset library as the Studio holds it: one small store (read with `useAssets()`), so the Assets panel,
 * a file dropped straight on the stage, and the arrange inspector all see the same list and uploads.
 */
import { useSyncExternalStore } from 'react';
import { ApiError, createAsset, deleteAsset, listAssets, renameAsset, uploadFile, type Asset, type AssetKind } from './api';
import { fileName, KIND_WORD, SCENE_MAX_BYTES } from './sceneMath';
import { primeGltf } from '../paint/sceneItems';

export type Upload = {
  key: string;
  name: string;
  /** 0..1 */
  progress: number;
  stage: 'opening' | 'uploading' | 'saving' | 'error';
  error?: string;
};

type State = { assets: Asset[] | null; max: number; error: string | null; uploads: Upload[] };

let state: State = { assets: null, max: 200, error: null, uploads: [] };
const subs = new Set<() => void>();
const emit = (next: Partial<State>) => {
  state = { ...state, ...next };
  for (const s of subs) s();
};
const subscribe = (fn: () => void) => {
  subs.add(fn);
  return () => subs.delete(fn);
};

export const useAssets = () => useSyncExternalStore(subscribe, () => state);
export const getAssets = () => state.assets ?? [];
export const assetByFile = (file: string) => state.assets?.find((a) => a.file === file);

let loading: Promise<void> | null = null;
export function loadAssets(force = false) {
  if (loading && !force) return loading;
  loading = listAssets()
    .then((r) => emit({ assets: r.assets, max: r.max, error: null }))
    .catch((e: Error) => {
      loading = null;
      emit({ error: e.message, assets: state.assets ?? [] });
    });
  return loading;
}

const setUpload = (key: string, patch: Partial<Upload> | null) =>
  emit({
    uploads: patch
      ? state.uploads.map((u) => (u.key === key ? { ...u, ...patch } : u))
      : state.uploads.filter((u) => u.key !== key),
  });

export const dismissUpload = (key: string) => setUpload(key, null);
export const dismissFailedUploads = () => emit({ uploads: state.uploads.filter((u) => u.stage !== 'error') });

let seq = 0;
let queue: Promise<unknown> = Promise.resolve();

/**
 * Adds files to the library, one after another. Resolves with the ones that made it (failures stay listed
 * in `uploads` with a plain message until dismissed).
 */
export function addFiles(files: File[]): Promise<Asset[]> {
  const entries = files.map((file) => ({ file, key: `u${++seq}` }));
  emit({
    uploads: [
      ...state.uploads.filter((u) => u.stage !== 'error'),
      ...entries.map(({ file, key }) => ({ key, name: file.name, progress: 0, stage: 'opening' as const })),
    ],
  });
  const run = queue.then(async () => {
    await loadAssets();
    const added: Asset[] = [];
    for (const { file, key } of entries) {
      const fail = (error: string) => setUpload(key, { stage: 'error', error });
      const { kindOf, measureFile } = await import('./measure');
      const kind: AssetKind | null = kindOf(file);
      if (!kind) {
        fail(`${file.name} isn’t a file this can use. Add 3D models as .glb, pictures as PNG, JPEG or WebP, and video as MP4.`);
        continue;
      }
      const max = SCENE_MAX_BYTES[kind];
      if (file.size > max) {
        fail(`${file.name} is ${(file.size / 1048576).toFixed(1)} MB. ${KIND_WORD[kind]}s can be up to ${Math.round(max / 1048576)} MB: make it smaller first.`);
        continue;
      }
      if (getAssets().length >= state.max) {
        fail(`Your asset library is full (${state.max} files). Delete some you no longer use to add more.`);
        continue;
      }
      try {
        const m = await measureFile(file, kind);
        setUpload(key, { stage: 'uploading', progress: 0 });
        const upload = await uploadFile(file, kind, (f) => setUpload(key, { progress: f * 0.95 }));
        setUpload(key, { stage: 'saving', progress: 0.97 });
        const form = new FormData();
        form.set('upload', upload);
        form.set('name', fileName(file.name));
        if (m.aspect != null) form.set('aspect', String(m.aspect));
        if (kind === 'model') {
          form.set('clips', JSON.stringify(m.clips));
          if (m.tris != null) form.set('tris', String(m.tris));
          if (m.dims) form.set('dims', JSON.stringify(m.dims));
        }
        if (m.thumb && m.thumb.size <= 300 * 1024) form.set('thumb', m.thumb, 'thumb.jpg');
        const asset = await createAsset(form);
        if (m.gltf) primeGltf(asset.file, m.gltf);
        emit({ assets: [asset, ...getAssets()] });
        setUpload(key, null);
        added.push(asset);
      } catch (e) {
        fail(e instanceof Error ? e.message : String(e));
      }
    }
    return added;
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function rename(id: string, name: string) {
  const a = await renameAsset(id, name);
  emit({ assets: getAssets().map((x) => (x.id === id ? a : x)) });
}

/**
 * Deletes one. While a piece of merch uses it, the server says which (409): that comes back as
 * { usedOn } so the panel can ask; with force it is taken off those pieces too.
 */
export async function remove(id: string, force = false): Promise<{ usedOn?: { id: string; name: string }[]; removedFrom?: { id: string; name: string }[] }> {
  try {
    const r = await deleteAsset(id, force);
    emit({ assets: getAssets().filter((x) => x.id !== id) });
    return { removedFrom: r.removedFrom };
  } catch (e) {
    if (e instanceof ApiError && e.status === 409 && Array.isArray(e.body.usedOn))
      return { usedOn: e.body.usedOn as { id: string; name: string }[] };
    throw e;
  }
}
