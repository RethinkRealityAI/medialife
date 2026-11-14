/**
 * The Assets tab: the shared library of models, pictures and video (any piece of merch can use them), and
 * the decals. Drop files anywhere on it (or tap the drop zone to choose); filter with the pills; tap a
 * card to put it in the middle of the print, or drag it onto the print. Each card's menu renames or
 * deletes it (a file a piece of merch still uses says which first).
 *
 * Loaded on demand (React.lazy) the first time the tab opens.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Box, Film, Image as ImageIcon, Loader2, MoreHorizontal, Search, UploadCloud, X } from 'lucide-react';
import { addFiles, dismissFailedUploads, dismissUpload, loadAssets, remove, rename, useAssets } from './assetStore';
import { formatBytes, formatCount, HEAVY_BYTES, HEAVY_TRIANGLES, KIND_WORD, SCENE_MAX_ITEMS } from './sceneMath';
import { DecalGrid } from './DecalTray';
import type { Asset } from './api';
import type { DecalDef } from './decals';
import type { DecalsApi } from './useDecals';

type Filter = 'all' | 'model' | 'image' | 'video' | 'decals';
const KIND_ICON = { model: Box, image: ImageIcon, video: Film } as const;
const ACCEPT = '.glb,.png,.jpg,.jpeg,.webp,.mp4,model/gltf-binary,image/png,image/jpeg,image/webp,video/mp4';

export const isHeavy = (a: Pick<Asset, 'tris' | 'bytes' | 'kind'>) =>
  a.kind === 'model' && ((a.tris ?? 0) > HEAVY_TRIANGLES || a.bytes > HEAVY_BYTES);

export type AssetsPanelProps = {
  sceneCount: number;
  pieceName: string;
  decals: DecalsApi;
  onAdd: (a: Asset) => void;
  onDragStart: (e: React.PointerEvent, a: Asset) => void;
  onPickDecal: (d: DecalDef) => void;
  onDecalDragStart: (e: React.PointerEvent, d: DecalDef) => void;
  /** Before a delete: the scene's changes saved, so the server knows what uses what. */
  beforeDelete: () => Promise<void>;
  onDeleted: (a: Asset) => void;
};

export default function AssetsPanel(p: AssetsPanelProps) {
  const { assets, max, error, uploads } = useAssets();
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [over, setOver] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ asset: Asset; usedOn?: { id: string; name: string }[]; busy?: boolean; error?: string } | null>(
    null,
  );
  const [decalCat, setDecalCat] = useState('wear');
  const input = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  useEffect(() => {
    void loadAssets();
  }, []);

  const list = assets ?? [];
  const counts = useMemo(
    () => ({
      all: list.length,
      model: list.filter((a) => a.kind === 'model').length,
      image: list.filter((a) => a.kind === 'image').length,
      video: list.filter((a) => a.kind === 'video').length,
    }),
    [list],
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return list.filter((a) => (filter === 'all' || a.kind === filter) && (!q || a.name.toLowerCase().includes(q)));
  }, [list, filter, query]);

  const take = (files: FileList | File[] | null) => {
    const f = files ? Array.from(files) : [];
    if (f.length) void addFiles(f);
  };

  const askDelete = (asset: Asset) => {
    setMenu(null);
    setConfirm({ asset });
  };
  const doDelete = async (force: boolean) => {
    if (!confirm) return;
    const asset = confirm.asset;
    setConfirm({ ...confirm, busy: true, error: undefined });
    try {
      await p.beforeDelete();
      const r = await remove(asset.id, force);
      if (r.usedOn) {
        setConfirm({ asset, usedOn: r.usedOn });
        return;
      }
      p.onDeleted(asset);
      setConfirm(null);
    } catch (e) {
      setConfirm({ ...confirm, busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  const pills: { k: Filter; label: string; n?: number }[] = [
    { k: 'all', label: 'All', n: counts.all },
    { k: 'model', label: '3D', n: counts.model },
    { k: 'image', label: 'Pictures', n: counts.image },
    { k: 'video', label: 'Video', n: counts.video },
    { k: 'decals', label: 'Decals', n: p.decals.library?.decals.length },
  ];

  return (
    <div
      className="relative flex flex-col gap-3 min-h-full"
      onDragEnter={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        dragDepth.current++;
        setOver(true);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDragLeave={() => {
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (!dragDepth.current) setOver(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) return;
        e.preventDefault();
        dragDepth.current = 0;
        setOver(false);
        take(e.dataTransfer.files);
      }}
    >
      <div role="tablist" aria-label="Show" className="flex flex-wrap gap-1.5">
        {pills.map((x) => (
          <button
            key={x.k}
            type="button"
            role="tab"
            aria-selected={filter === x.k}
            onClick={() => setFilter(x.k)}
            className={`tap rounded-full px-3 min-h-[34px] text-[12px] font-semibold flex items-center gap-1.5 ${
              filter === x.k ? 'bg-[#f6c344] text-[#15131a]' : 'bg-white/[0.07] text-white/75 hover:bg-white/[0.14]'
            }`}
          >
            {x.label}
            {x.n != null && <span className={`tabular-nums ${filter === x.k ? 'text-[#15131a]/70' : 'text-white/45'}`}>{x.n}</span>}
          </button>
        ))}
      </div>

      {filter === 'decals' ? (
        <>
          <div className="flex gap-1.5">
            {(p.decals.library?.cats ?? []).map((c) => (
              <button
                key={c.k}
                type="button"
                onClick={() => setDecalCat(c.k)}
                aria-pressed={decalCat === c.k}
                className={`tap rounded-full px-3 min-h-[32px] text-[11.5px] font-semibold ${
                  decalCat === c.k ? 'bg-white text-[#15131a]' : 'bg-white/[0.07] text-white/70 hover:bg-white/[0.14]'
                }`}
              >
                {c.n}
              </button>
            ))}
          </div>
          <p className="text-[11.5px] leading-snug text-white/55">
            Decals go on this painting, not on the piece. Tap one to stick it on, or drag it onto the print.
          </p>
          <DecalGrid decals={p.decals} cat={decalCat} onPick={p.onPickDecal} onDragStart={p.onDecalDragStart} drag="sideways" tile={72} />
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={`tap w-full rounded-2xl border-2 border-dashed px-4 py-4 text-center transition-colors ${
              over ? 'border-[#f6c344] bg-[#f6c344]/15' : 'border-white/20 bg-white/[0.04] hover:bg-white/[0.08]'
            }`}
          >
            <UploadCloud size={20} className="mx-auto mb-1.5 text-[#f6c344]" />
            <span className="block text-[12.5px] font-semibold text-white">Drop models, pictures or video here, or tap to choose</span>
            <span className="mt-1 block text-[10.5px] text-white/50">
              3D as .glb (up to 8 MB) · PNG, JPEG or WebP (4 MB) · MP4 (20 MB)
            </span>
          </button>
          <input
            ref={input}
            type="file"
            multiple
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              take(e.target.files);
              e.target.value = '';
            }}
          />

          {uploads.length > 0 && (
            <ul className="flex flex-col gap-1.5" aria-label="Adding">
              {uploads.map((u) => (
                <li key={u.key} className={`rounded-xl px-3 py-2 text-[11.5px] ${u.stage === 'error' ? 'bg-[#ff3b4e]/15 border border-[#ff3b4e]/50' : 'bg-white/[0.06]'}`}>
                  <div className="flex items-center gap-2">
                    {u.stage === 'error' ? (
                      <AlertTriangle size={13} className="shrink-0 text-[#ff8a96]" />
                    ) : (
                      <Loader2 size={13} className="shrink-0 animate-spin text-[#f6c344]" />
                    )}
                    <span className="min-w-0 flex-1 truncate font-semibold text-white/90">{u.name}</span>
                    {u.stage === 'error' ? (
                      <button type="button" aria-label={`Dismiss ${u.name}`} className="tap -m-1 p-1 text-white/60 hover:text-white" onClick={() => dismissUpload(u.key)}>
                        <X size={13} />
                      </button>
                    ) : (
                      <span className="shrink-0 text-white/55">
                        {u.stage === 'opening' ? 'Opening' : u.stage === 'saving' ? 'Saving' : `${Math.round(u.progress * 100)}%`}
                      </span>
                    )}
                  </div>
                  {u.stage === 'error' ? (
                    <p className="mt-1 leading-snug text-white/80">{u.error}</p>
                  ) : (
                    <div className="mt-1.5 h-1 rounded-full bg-white/10 overflow-hidden">
                      <div className="h-full bg-[#f6c344] transition-[width]" style={{ width: `${Math.max(4, u.progress * 100)}%` }} />
                    </div>
                  )}
                </li>
              ))}
              {uploads.filter((u) => u.stage === 'error').length > 1 && (
                <button type="button" className="tap self-end text-[11px] text-white/60 underline" onClick={dismissFailedUploads}>
                  Clear these
                </button>
              )}
            </ul>
          )}

          {list.length > 12 && (
            <label className="flex items-center gap-2 rounded-full bg-white/[0.06] px-3 min-h-[38px]">
              <Search size={13} className="text-white/50 shrink-0" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find by name"
                aria-label="Find an asset by name"
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-white placeholder:text-white/40 outline-none"
              />
            </label>
          )}

          {error && !assets?.length ? (
            <p className="rounded-xl bg-[#ff3b4e]/15 border border-[#ff3b4e]/50 px-3 py-2 text-[12px] text-white/85">
              {error}{' '}
              <button type="button" className="tap underline" onClick={() => void loadAssets(true)}>
                Try again
              </button>
            </p>
          ) : assets == null ? (
            <div className="flex items-center gap-2 text-[12px] text-white/60">
              <Loader2 size={13} className="animate-spin" /> Loading your assets
            </div>
          ) : list.length === 0 ? (
            <p className="px-1 text-[12.5px] leading-snug text-white/60">
              Nothing here yet. Add a 3D model, a picture or a video and it can go on any piece of merch.
            </p>
          ) : (
            <>
              <p className="text-[11px] leading-snug text-white/50">
                {p.sceneCount >= SCENE_MAX_ITEMS
                  ? `${p.pieceName} has ${SCENE_MAX_ITEMS} things on it, the most it can have. Delete one to add another.`
                  : 'Tap one to add it to the middle of the print, or drag it onto the print.'}
              </p>
              {shown.length === 0 ? (
                <p className="px-1 text-[12px] text-white/55">Nothing matches.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2.5">
                  {shown.map((a) => (
                    <AssetCard
                      key={a.id}
                      asset={a}
                      menuOpen={menu === a.id}
                      renaming={renaming === a.id}
                      onMenu={() => setMenu(menu === a.id ? null : a.id)}
                      onRename={() => {
                        setMenu(null);
                        setRenaming(a.id);
                      }}
                      onRenamed={async (name) => {
                        setRenaming(null);
                        if (name && name !== a.name) await rename(a.id, name).catch((e: Error) => alert(e.message));
                      }}
                      onDelete={() => askDelete(a)}
                      onAdd={() => p.onAdd(a)}
                      onDragStart={(e) => p.onDragStart(e, a)}
                    />
                  ))}
                </div>
              )}
              <p className="mono-caps text-[8.5px] text-white/35 text-center">
                {list.length} of {max} in the library
              </p>
            </>
          )}
        </>
      )}

      {over && filter !== 'decals' && (
        <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-[#f6c344] bg-[#15131a]/80 grid place-items-center text-[13px] font-semibold text-white">
          Drop to add to your assets
        </div>
      )}

      {confirm && (
        <div role="alertdialog" aria-labelledby="asset-del-h" className="sticky bottom-0 rounded-2xl border border-white/15 bg-[#1d1e23] p-3 shadow-[0_-10px_30px_-12px_rgba(0,0,0,.7)]">
          <h3 id="asset-del-h" className="text-[13px] font-semibold text-white">
            Delete “{confirm.asset.name}”?
          </h3>
          <p className="mt-1 text-[12px] leading-snug text-white/70">
            {confirm.usedOn
              ? `It’s used on ${confirm.usedOn.map((x) => x.name).join(', ')}. Deleting it takes it off ${confirm.usedOn.length === 1 ? 'that piece' : 'those pieces'} too.`
              : 'It goes from the library for good.'}
          </p>
          {confirm.error && <p className="mt-1 text-[12px] text-[#ff8a96]">{confirm.error}</p>}
          <div className="mt-2.5 flex justify-end gap-2">
            <button type="button" className="tap rounded-full bg-white/[0.08] px-4 min-h-[40px] text-[12px] font-semibold text-white" onClick={() => setConfirm(null)}>
              Keep it
            </button>
            <button
              type="button"
              disabled={confirm.busy}
              className="tap rounded-full bg-[#ff3b4e] px-4 min-h-[40px] text-[12px] font-bold text-white disabled:opacity-60"
              onClick={() => void doDelete(!!confirm.usedOn)}
            >
              {confirm.busy ? 'Deleting…' : confirm.usedOn ? 'Delete everywhere' : 'Delete'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const AssetCard: React.FC<{
  asset: Asset;
  menuOpen: boolean;
  renaming: boolean;
  onMenu: () => void;
  onRename: () => void;
  onRenamed: (name: string) => void;
  onDelete: () => void;
  onAdd: () => void;
  onDragStart: (e: React.PointerEvent) => void;
}> = ({ asset: a, menuOpen, renaming, onMenu, onRename, onRenamed, onDelete, onAdd, onDragStart }) => {
  const Icon = KIND_ICON[a.kind];
  const heavy = isHeavy(a);
  return (
    <div className="relative rounded-2xl border border-white/10 bg-white/[0.05] overflow-hidden" data-asset={a.id}>
      <button
        type="button"
        onPointerDown={onDragStart}
        onClick={(e) => {
          if (e.detail === 0) onAdd();
        }}
        title={`${a.name}: tap to add, or drag onto the print`}
        aria-label={`Add ${a.name}`}
        className="tap block w-full text-left"
        style={{ touchAction: 'pan-y' }}
      >
        <div className="aspect-square bg-[#2b2d33] grid place-items-center">
          {a.thumb ? (
            <img src={a.thumb} alt="" draggable={false} className="h-full w-full object-contain pointer-events-none" loading="lazy" />
          ) : (
            <Icon size={28} className="text-white/40" />
          )}
        </div>
        <div className="px-2.5 pt-2 pb-2.5">
          {!renaming && <span className="block truncate text-[12px] font-semibold text-white pr-5">{a.name}</span>}
          {renaming && <span className="block h-[18px]" />}
          <span className="mono-caps mt-0.5 flex items-center gap-1 text-[8px] text-white/55">
            <Icon size={9} className="shrink-0" />
            <span className="truncate">
              {a.kind === 'model' ? '3D' : KIND_WORD[a.kind]} · {formatBytes(a.bytes)}
              {a.kind === 'model' && a.tris != null ? ` · ${formatCount(a.tris)} tris` : ''}
            </span>
          </span>
          {heavy && (
            <span className="mt-1 flex items-center gap-1 text-[10px] text-amber-200" title="May load slowly on phones. Aim for under 150k triangles and 5 MB.">
              <AlertTriangle size={10} /> Heavy for phones
            </span>
          )}
        </div>
      </button>
      {renaming && (
        <input
          autoFocus
          defaultValue={a.name}
          maxLength={80}
          aria-label="New name"
          className="absolute left-2 right-2 rounded-lg bg-[#0f1013] px-2 py-1 text-[12px] text-white outline-none ring-2 ring-[#f6c344]"
          style={{ top: 'calc(100% - 52px)' }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onRenamed((e.target as HTMLInputElement).value.trim());
            if (e.key === 'Escape') onRenamed('');
          }}
          onBlur={(e) => onRenamed(e.target.value.trim())}
        />
      )}
      <button
        type="button"
        aria-label={`More for ${a.name}`}
        aria-expanded={menuOpen}
        onClick={onMenu}
        className="tap absolute right-1 top-1 grid h-9 w-9 place-items-center rounded-full bg-[#15131a]/70 text-white/80 hover:text-white"
      >
        <MoreHorizontal size={15} />
      </button>
      {menuOpen && (
        <div role="menu" className="absolute right-1 top-11 z-10 w-32 rounded-xl border border-white/15 bg-[#1d1e23] p-1 shadow-xl">
          <button role="menuitem" type="button" className="tap w-full rounded-lg px-3 min-h-[38px] text-left text-[12px] text-white hover:bg-white/10" onClick={onRename}>
            Rename
          </button>
          <button role="menuitem" type="button" className="tap w-full rounded-lg px-3 min-h-[38px] text-left text-[12px] text-[#ff8a96] hover:bg-white/10" onClick={onDelete}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
};

