/**
 * The decal tray: the AR page's decal library (three kinds), docked above the toolbar like the stamp
 * shelf, never modal, so the next tap reaches the print. Tap a decal to stick it on, or drag it up onto
 * the print. With one selected: Flip, To front, Remove. Done goes back to painting.
 *
 * `DecalGrid` is the same tiles for the Assets panel's Decals filter.
 */
import React, { useState } from 'react';
import { motion } from 'motion/react';
import { ArrowUpToLine, FlipHorizontal2, Loader2, Sticker, Trash2 } from 'lucide-react';
import { DECAL_BASE, MAX_DECALS, type DecalDef } from './decals';
import type { DecalsApi } from './useDecals';

export const DecalGrid: React.FC<{
  decals: DecalsApi;
  cat: string;
  onPick: (def: DecalDef) => void;
  onDragStart: (e: React.PointerEvent, def: DecalDef) => void;
  /** Rail: tiles drag sideways (the list scrolls up and down). Tray: they drag upwards. */
  drag: 'sideways' | 'up';
  tile?: number;
}> = ({ decals, cat, onPick, onDragStart, drag, tile = 64 }) => {
  if (decals.libError)
    return (
      <p className="px-1 py-3 text-[12px] text-white/70">
        The decals didn’t load.{' '}
        <button type="button" className="tap underline text-white" onClick={decals.retryLibrary}>
          Try again
        </button>
      </p>
    );
  if (!decals.library)
    return (
      <div className="flex items-center gap-2 px-1 py-3 text-[12px] text-white/60">
        <Loader2 size={13} className="animate-spin" /> Loading decals
      </div>
    );
  const list = decals.library.decals.filter((d) => d.cat === cat);
  return (
    <div
      className={drag === 'up' ? 'flex gap-2 overflow-x-auto no-scrollbar pb-1' : 'grid gap-2'}
      style={drag === 'up' ? undefined : { gridTemplateColumns: `repeat(auto-fill, minmax(${tile}px, 1fr))` }}
    >
      {list.map((d) => (
        <button
          key={d.id}
          type="button"
          title={`${d.name}: tap to stick it on, or drag it onto the print`}
          aria-label={`Stick on ${d.name}`}
          onPointerDown={(e) => onDragStart(e, d)}
          onClick={(e) => {
            if (e.detail === 0) onPick(d); // keyboard; pointer taps come through the drag helper
          }}
          className="tap shrink-0 grid place-items-center rounded-2xl border border-white/12 bg-white/[0.06] p-1.5 hover:bg-white/[0.12] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#f6c344]"
          style={{ width: drag === 'up' ? tile : undefined, height: tile, touchAction: drag === 'up' ? 'pan-x' : 'pan-y' }}
        >
          <img src={DECAL_BASE + d.file} alt="" draggable={false} className="max-h-full max-w-full object-contain pointer-events-none" />
        </button>
      ))}
    </div>
  );
};

export const DecalTray: React.FC<{
  decals: DecalsApi;
  bobo: boolean;
  onPick: (def: DecalDef) => void;
  onDragStart: (e: React.PointerEvent, def: DecalDef) => void;
  onDone: () => void;
  notice: string | null;
}> = ({ decals, bobo, onPick, onDragStart, onDone, notice }) => {
  const cats = decals.library?.cats ?? [];
  const [cat, setCat] = useState<string | null>(null);
  const active = cat ?? cats[0]?.k ?? 'wear';
  const sel = decals.selected;
  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 18 }}
      transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      className="glass-strong rounded-[26px] p-3 w-full max-w-[min(100%,640px)] pointer-events-auto"
    >
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <Sticker size={14} className="text-[#f6c344] shrink-0" />
        <span className="text-[13px] font-semibold text-white/90">Decals</span>
        <span className="mono-caps text-[8.5px] text-white/45">
          {decals.list.length} of {MAX_DECALS}
        </span>
        <div className="flex-1" />
        <div role="tablist" aria-label="Kind of decal" className="flex gap-1">
          {cats.map((c) => (
            <button
              key={c.k}
              type="button"
              role="tab"
              aria-selected={active === c.k}
              onClick={() => setCat(c.k)}
              className={`tap rounded-full px-3 min-h-[34px] text-[12px] font-semibold ${
                active === c.k ? 'bg-[#f6c344] text-[#15131a]' : 'bg-white/[0.07] text-white/75 hover:bg-white/[0.14]'
              }`}
            >
              {c.n}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onDone}
          className="tap rounded-full bg-white text-[#15131a] px-4 min-h-[36px] text-[12px] font-bold"
        >
          Done
        </button>
      </div>
      <DecalGrid decals={decals} cat={active} onPick={onPick} onDragStart={onDragStart} drag="up" tile={60} />
      <div className="mt-2 flex flex-wrap items-center gap-2 min-h-[36px]">
        {sel != null && decals.list[sel] ? (
          <>
            <button
              type="button"
              onClick={() => decals.flip(sel)}
              className="tap flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 min-h-[36px] text-[12px] font-semibold text-white/85 hover:bg-white/[0.15]"
            >
              <FlipHorizontal2 size={13} /> Flip
            </button>
            <button
              type="button"
              onClick={() => decals.toFront(sel)}
              disabled={sel === decals.list.length - 1}
              className="tap flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 min-h-[36px] text-[12px] font-semibold text-white/85 hover:bg-white/[0.15] disabled:opacity-40"
            >
              <ArrowUpToLine size={13} /> To front
            </button>
            <button
              type="button"
              onClick={() => decals.remove(sel)}
              className="tap flex items-center gap-1.5 rounded-full bg-white/[0.08] px-3 min-h-[36px] text-[12px] font-semibold text-white/85 hover:bg-[#ff3b4e]/80"
            >
              <Trash2 size={13} /> Remove
            </button>
            <span className="text-[11px] text-white/50">Drag it to move. Pinch, or drag the yellow handle, to size and turn.</span>
          </>
        ) : (
          <span className="text-[11px] text-white/55">
            {notice ??
              (decals.full
                ? `That’s the most decals one painting can have (${MAX_DECALS}). Remove one to add another.`
                : bobo && active === (cats[0]?.k ?? 'wear')
                  ? 'Tap one to stick it on: these fit right on Bobo. Or drag one onto the print.'
                  : 'Tap one to stick it on, or drag it onto the print. Tap a decal on the print to change it.')}
          </span>
        )}
      </div>
    </motion.div>
  );
};
