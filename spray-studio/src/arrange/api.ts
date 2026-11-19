/**
 * The Studio's calls for the asset library and scenes (the site's /api/spray/admin/assets and
 * /api/spray/admin/sets/<id>/scene). Same-origin, so the /admin cookie goes along; writes carry the
 * x-spray header the server asks for.
 */
import type { SceneItem } from '../paint/sceneItems';

export type AssetKind = SceneItem['kind'];

/** One file in the shared library (src/lib/spray/model.ts `Asset` in the site). */
export type Asset = {
  id: string;
  kind: AssetKind;
  name: string;
  file: string;
  bytes: number;
  thumb: string | null;
  aspect: number | null;
  clips: string[];
  tris: number | null;
  dims: [number, number, number] | null;
  createdAt: number;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  const write = !!init.method && init.method !== 'GET';
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      credentials: 'same-origin',
      headers: { ...(write ? { 'x-spray': '1' } : {}), ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError('Couldn’t reach the server. Check the connection and try again.', 0);
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      res.status === 401
        ? 'You are signed out. Sign in again at /admin/login.'
        : typeof body.error === 'string'
          ? body.error
          : `Something went wrong (error ${res.status}).`;
    throw new ApiError(msg, res.status, body);
  }
  return body as T;
}

export const listAssets = () => call<{ assets: Asset[]; max: number }>('/api/spray/admin/assets');

const CHUNK = 4 * 1024 * 1024;

/** Sends a file up in ≤4 MB pieces; resolves with its upload name. */
export async function uploadFile(file: Blob, kind: AssetKind, onProgress?: (f: number) => void) {
  const parts = Math.max(1, Math.ceil(file.size / CHUNK));
  let upload = '';
  for (let part = 0; part < parts; part++) {
    const form = new FormData();
    form.set('file', file.slice(part * CHUNK, (part + 1) * CHUNK), 'piece');
    form.set('kind', kind);
    form.set('size', String(file.size));
    form.set('part', String(part));
    if (upload) form.set('upload', upload);
    const r = await call<{ done: boolean; upload: string }>('/api/spray/admin/assets/upload', { method: 'POST', body: form });
    onProgress?.((part + 1) / parts);
    upload = r.upload;
    if (r.done) return upload;
  }
  throw new ApiError('The upload didn’t finish. Try again.', 0);
}

export const createAsset = (form: FormData) =>
  call<{ asset: Asset }>('/api/spray/admin/assets', { method: 'POST', body: form }).then((r) => r.asset);

export const renameAsset = (id: string, name: string) =>
  call<{ asset: Asset }>(`/api/spray/admin/assets/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r) => r.asset);

export const deleteAsset = (id: string, force = false) =>
  call<{ ok: true; removedFrom: { id: string; name: string }[] }>(`/api/spray/admin/assets/${id}${force ? '?force=1' : ''}`, {
    method: 'DELETE',
  });

export const saveSceneTo = (paintableId: string, scene: SceneItem[]) =>
  call<{ paintable: { scene?: SceneItem[] } }>(`/api/spray/admin/sets/${encodeURIComponent(paintableId)}/scene`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    // keepFiles: the Studio autosaves and can undo a delete afterwards, so it never deletes files
    body: JSON.stringify({ scene, keepFiles: true }),
  });

/** For leaving the page: the request outlives it (keepalive). */
export function saveSceneOnExit(paintableId: string, scene: SceneItem[]) {
  try {
    void fetch(`/api/spray/admin/sets/${encodeURIComponent(paintableId)}/scene`, {
      method: 'PUT',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json', 'x-spray': '1' },
      body: JSON.stringify({ scene, keepFiles: true }),
    });
  } catch {
    /* nothing more to do */
  }
}
