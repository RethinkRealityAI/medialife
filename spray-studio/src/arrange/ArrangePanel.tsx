/**
 * Arrange mode's panel: what dragging on the stage does (Move / Rotate / Resize, Snap), the selected
 * item's numbers in the admin scene editor's words, its shortcuts (Centre on print, Sit flat, Stand up),
 * and "In this scene". Loaded on demand (React.lazy).
 */
import React, { useEffect, useState } from 'react';
import {
  AlertTriangle, Box, Copy, Crosshair, Eye, EyeOff, Film, Image as ImageIcon, Layers, Move, RectangleVertical,
  Rotate3d, Scaling, Trash2,
} from 'lucide-react';
import type { SceneItem } from '../paint/sceneItems';
import { assetByFile } from './assetStore';
import {
  centreOnPrint, clamp, formatBytes, formatCount, HEAVY_TRIANGLES, KIND_WORD, mm, POS_LIMIT, round, SCENE_MAX_ITEMS,
  SIZE_MAX, SIZE_MIN, sitFlat, standUp,
} from './sceneMath';
import type { ArrangeApi, ArrangeTool } from './useArrange';

const KIND_ICON = { model: Box, image: ImageIcon, video: Film } as const;
const TOOLS: { k: ArrangeTool; label: string; icon: React.ReactNode; hint: string }[] = [
  { k: 'move', label: 'Move', icon: <Move size={13} />, hint: 'Drag it on the stage to move it.' },
  { k: 'rotate', label: 'Rotate', icon: <Rotate3d size={13} />, hint: 'Drag sideways to turn it, up or down to tip it.' },
  { k: 'resize', label: 'Resize', icon: <Scaling size={13} />, hint: 'Drag right or up to make it bigger.' },
];

const btn =
  'tap flex items-center justify-center gap-1.5 rounded-xl border border-white/12 bg-white/[0.06] px-2 min-h-[40px] text-[11.5px] leading-tight font-semibold text-white/85 hover:bg-white/[0.13] disabled:opacity-40 [&_svg]:shrink-0';

function NumberField({
  label,
  unit,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  unit: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(round(value, 0.1)));
  const [focus, setFocus] = useState(false);
  useEffect(() => {
    if (!focus) setText(String(Number(round(value, 0.1).toFixed(1))));
  }, [value, focus]);
  return (
    <label className="min-w-0 block">
      <span className="mb-1 block truncate text-[10.5px] font-medium text-white/60" title={label}>
        {label}
      </span>
      <span className="flex items-center rounded-xl border border-white/10 bg-[#0f1013] focus-within:ring-2 focus-within:ring-[#f6c344]">
        <input
          inputMode="decimal"
          className="min-w-0 flex-1 bg-transparent pl-2 pr-1 h-10 text-[12.5px] text-white tabular-nums outline-none"
          value={text}
          onFocus={() => setFocus(true)}
          onBlur={() => setFocus(false)}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value);
            if (e.target.value.trim() !== '' && Number.isFinite(v)) onChange(clamp(v, min, max));
          }}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
            e.preventDefault();
            e.stopPropagation();
            const step = e.shiftKey ? 10 : 1;
            onChange(clamp(round(value + (e.key === 'ArrowUp' ? step : -step), 0.1), min, max));
          }}
        />
        <span className="pr-1.5 text-[10px] text-white/40">{unit}</span>
      </span>
    </label>
  );
}

export default function ArrangePanel({ arrange, compact }: { arrange: ArrangeApi; compact?: boolean }) {
  const it = arrange.selectedItem;
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div role="radiogroup" aria-label="What dragging does" className="grid grid-cols-3 gap-1.5">
          {TOOLS.map((t) => (
            <button
              key={t.k}
              type="button"
              role="radio"
              aria-checked={arrange.tool === t.k}
              onClick={() => arrange.setTool(t.k)}
              className={`tap flex items-center justify-center gap-1.5 rounded-full min-h-[40px] text-[12px] font-semibold ${
                arrange.tool === t.k ? 'bg-[#f6c344] text-[#15131a]' : 'bg-white/[0.07] text-white/75 hover:bg-white/[0.14]'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          <p className="flex-1 text-[11px] leading-snug text-white/55">
            {it ? TOOLS.find((t) => t.k === arrange.tool)?.hint : 'Tap something on the stage to change it.'}
          </p>
          <label className="tap flex shrink-0 items-center gap-1.5 text-[11px] text-white/75">
            <input type="checkbox" className="h-4 w-4 accent-[#f6c344]" checked={arrange.snap} onChange={(e) => arrange.setSnap(e.target.checked)} />
            Snap
          </label>
        </div>
      </div>

      {it ? <Inspector key={it.id} arrange={arrange} item={it} /> : null}

      <SceneList arrange={arrange} compact={compact} />
    </div>
  );
}

function Inspector({ arrange, item }: { arrange: ArrangeApi; item: SceneItem }) {
  const info = arrange.info(item.file);
  const asset = assetByFile(item.file);
  const dims = arrange.dims(item);
  const Icon = KIND_ICON[item.kind];
  const ch = (next: SceneItem, merge?: string) => arrange.update(item.id, next, merge);
  const setPos = (i: number, v: number) => {
    const pos = [...item.pos] as SceneItem['pos'];
    pos[i] = v;
    ch({ ...item, pos }, `pos${i}:${item.id}`);
  };
  const setRot = (i: number, v: number) => {
    const rot = [...item.rot] as SceneItem['rot'];
    rot[i] = v;
    ch({ ...item, rot }, `rot${i}:${item.id}`);
  };
  const tris = info?.tris ?? asset?.tris ?? null;
  const clips = info?.clips ?? asset?.clips ?? [];
  const heavy = item.kind === 'model' && ((tris ?? 0) > HEAVY_TRIANGLES || (asset?.bytes ?? 0) > 5 * 1024 * 1024);
  return (
    <section aria-label={`${item.name}: settings`} className="rounded-2xl border border-white/10 bg-white/[0.04] p-3">
      <div className="mb-2 flex items-center gap-2">
        <Icon size={14} className="shrink-0 text-[#f6c344]" />
        <h3 className="min-w-0 flex-1 truncate text-[13px] font-semibold text-white">{item.name}</h3>
        <span className="mono-caps text-[8px] text-white/50">{KIND_WORD[item.kind]}</span>
      </div>
      <p className="text-[11px] text-white/60 tabular-nums">
        Real size {mm(dims.w)} × {mm(dims.h)}
        {item.kind === 'model' ? ` × ${mm(dims.d)}` : ''} mm
        {asset ? ` · ${formatBytes(asset.bytes)}` : ''}
        {tris != null && item.kind === 'model' ? ` · ${formatCount(tris)} triangles` : ''}
      </p>
      {heavy && (
        <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-100">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          This may load slowly on phones. Aim for under 150k triangles and 5 MB.
        </p>
      )}
      {info?.error && <p className="mt-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-2.5 py-1.5 text-[11px] text-rose-100">{info.error}</p>}

      <fieldset className="mt-3">
        <legend className="mono-caps mb-1.5 text-[8.5px] text-white/55">Position (mm from the centre of the print)</legend>
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField label="Right" unit="mm" value={item.pos[0]} min={-POS_LIMIT} max={POS_LIMIT} onChange={(v) => setPos(0, v)} />
          <NumberField label="Up" unit="mm" value={item.pos[1]} min={-POS_LIMIT} max={POS_LIMIT} onChange={(v) => setPos(1, v)} />
          <NumberField label="Out from the print" unit="mm" value={item.pos[2]} min={-POS_LIMIT} max={POS_LIMIT} onChange={(v) => setPos(2, v)} />
        </div>
      </fieldset>
      <fieldset className="mt-3">
        <legend className="mono-caps mb-1.5 text-[8.5px] text-white/55">Turn (degrees)</legend>
        <div className="grid grid-cols-3 gap-1.5">
          <NumberField label="Tip forward" unit="°" value={item.rot[0]} min={-360} max={360} onChange={(v) => setRot(0, v)} />
          <NumberField label="Turn" unit="°" value={item.rot[1]} min={-360} max={360} onChange={(v) => setRot(1, v)} />
          <NumberField label="Spin" unit="°" value={item.rot[2]} min={-360} max={360} onChange={(v) => setRot(2, v)} />
        </div>
      </fieldset>
      <div className="mt-3 grid grid-cols-2 gap-1.5">
        <NumberField
          label={item.kind === 'model' ? 'Height' : 'Height of the picture'}
          unit="mm"
          value={item.size}
          min={SIZE_MIN}
          max={SIZE_MAX}
          onChange={(v) => ch({ ...item, size: v }, `size:${item.id}`)}
        />
        {item.kind === 'model' && (
          <label className="min-w-0 block">
            <span className="mb-1 block text-[10.5px] font-medium text-white/60">Animation</span>
            <select
              className="h-10 w-full rounded-xl border border-white/10 bg-[#0f1013] px-2 text-[12px] text-white outline-none focus:ring-2 focus:ring-[#f6c344] disabled:opacity-50"
              value={item.clip ?? ''}
              disabled={!clips.length}
              onChange={(e) => ch({ ...item, clip: e.target.value || null })}
            >
              <option value="">None</option>
              {clips.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {item.clip && !clips.includes(item.clip) && <option value={item.clip}>{item.clip} (not in this file)</option>}
            </select>
          </label>
        )}
      </div>
      {item.kind === 'video' && (
        <label className="tap mt-2 flex min-h-[44px] items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-[12px] text-white/85">
          <input type="checkbox" className="h-4 w-4 accent-[#f6c344]" checked={item.sound} onChange={(e) => ch({ ...item, sound: e.target.checked })} />
          <span>
            Play with sound
            <span className="block text-[10.5px] text-white/50">Fans tap once to hear it. It plays muted here.</span>
          </span>
        </label>
      )}
      <div className="mt-3 grid grid-cols-1 gap-1.5">
        <button type="button" className={btn} onClick={() => ch(centreOnPrint(item))}>
          <Crosshair size={13} /> Centre on print
        </button>
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" className={btn} onClick={() => ch(sitFlat(item, info))}>
            <Layers size={13} /> Sit flat on the print
          </button>
          <button type="button" className={btn} onClick={() => ch(standUp(item, info))}>
            <RectangleVertical size={13} /> Stand up on the print
          </button>
        </div>
      </div>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        <button type="button" className={btn} onClick={() => ch({ ...item, visible: !item.visible })}>
          {item.visible ? <EyeOff size={13} /> : <Eye size={13} />} {item.visible ? 'Hide' : 'Show'}
        </button>
        <button type="button" className={btn} disabled={arrange.full} onClick={() => arrange.duplicate(item.id)} title={arrange.full ? `${SCENE_MAX_ITEMS} is the most one piece can have` : undefined}>
          <Copy size={13} /> Duplicate
        </button>
        <button type="button" className={`${btn} hover:!bg-[#ff3b4e]/80`} onClick={() => arrange.remove(item.id)}>
          <Trash2 size={13} /> Delete
        </button>
      </div>
    </section>
  );
}

function SceneList({ arrange, compact }: { arrange: ArrangeApi; compact?: boolean }) {
  return (
    <section aria-label="In this scene">
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[12.5px] font-semibold text-white/90">In this scene</h3>
        <span className="mono-caps text-[8.5px] text-white/45">
          {arrange.items.length} of {SCENE_MAX_ITEMS}
        </span>
      </div>
      {arrange.items.length === 0 ? (
        <p className="text-[11.5px] leading-snug text-white/55">
          Nothing placed yet. {compact ? 'Add something from Assets.' : 'Open Assets on the right and drag something onto the print.'}
        </p>
      ) : (
        <ul className="flex flex-col gap-1">
          {arrange.items.map((it) => {
            const Icon = KIND_ICON[it.kind];
            const sel = it.id === arrange.selected;
            return (
              <li key={it.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => arrange.select(sel ? null : it.id)}
                  aria-pressed={sel}
                  className={`tap flex min-h-[40px] min-w-0 flex-1 items-center gap-2 rounded-xl px-2.5 text-left text-[12px] ${
                    sel ? 'bg-[#f6c344]/20 ring-1 ring-[#f6c344] text-white' : 'bg-white/[0.05] text-white/80 hover:bg-white/[0.1]'
                  } ${it.visible ? '' : 'opacity-55'}`}
                >
                  <Icon size={13} className="shrink-0 text-white/60" />
                  <span className="truncate">{it.name}</span>
                </button>
                <button
                  type="button"
                  aria-label={it.visible ? `Hide ${it.name}` : `Show ${it.name}`}
                  title={it.visible ? 'Hide' : 'Show'}
                  onClick={() => arrange.update(it.id, { ...it, visible: !it.visible })}
                  className="tap grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white/60 hover:bg-white/10 hover:text-white"
                >
                  {it.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
