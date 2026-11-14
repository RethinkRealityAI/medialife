/**
 * Loads the Spray Bobo paintables (merch you can spray) from the site's CMS and folds them into the
 * object catalog. Signed-in admins (the Studio) also get drafts, so a new upload can be tried before it
 * goes live; phones joining a room get live ones plus whichever one the studio has loaded (by id).
 */
import { OBJECT_BY_ID, PAINTABLE_OBJECTS, PaintableObject, SprayPaintable, paintableId } from './objectCatalog';

let pending: Promise<number> | null = null;

function register(p: SprayPaintable): PaintableObject {
  const id = paintableId(p.id);
  const entry: PaintableObject = {
    id,
    label: p.name,
    short: p.name.length > 12 ? `${p.name.slice(0, 11)}…` : p.name,
    thumb: p.files.thumb,
    category: p.status === 'live' ? 'Merch' : 'Drafts',
    blurb: `${p.client}${p.status === 'draft' ? ' · draft' : ''}`,
    targetSize: 11,
    paintable: p,
  };
  const at = PAINTABLE_OBJECTS.findIndex((o) => o.id === id);
  if (at >= 0) PAINTABLE_OBJECTS[at] = entry;
  else PAINTABLE_OBJECTS.push(entry);
  OBJECT_BY_ID.set(id, entry);
  return entry;
}

export function ensureCustomModels(): Promise<number> {
  if (pending) return pending;
  pending = fetch('/api/spray/sets?all=1', { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : { sets: [] }))
    .then(({ sets }: { sets: SprayPaintable[] }) => {
      for (const p of sets) register(p);
      return sets.length;
    })
    .catch(() => 0);
  return pending;
}
/** The paintables, once loaded. */
export const ensurePaintables = ensureCustomModels;

/**
 * One paintable by its catalog id ("sp-<id>"): from the loaded list, or fetched on its own (a phone
 * joining a room where the studio is trying a draft: drafts are not in the public list).
 */
export async function ensurePaintable(catalogId: string): Promise<PaintableObject> {
  await ensureCustomModels();
  const hit = OBJECT_BY_ID.get(catalogId as never);
  if (hit?.paintable) return hit;
  const r = await fetch(`/api/spray/sets/${encodeURIComponent(catalogId.replace(/^sp-/, ''))}`);
  if (!r.ok) throw new Error(`unknown paintable ${catalogId}`);
  const { set } = (await r.json()) as { set: SprayPaintable };
  return register(set);
}
