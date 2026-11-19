import { useEffect, useId, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Copy,
  Crosshair,
  Eye,
  EyeOff,
  Layers,
  RectangleVertical,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";

import {
  centreOnPrint,
  clamp,
  formatBytes,
  formatCount,
  itemDims,
  mm,
  POS_LIMIT,
  SIZE_MAX,
  SIZE_MIN,
  sitFlat,
  standUp,
} from "./scene-math";
import type { AssetInfo, SceneItem } from "./types";
import { btn, card, isHeavy, KIND_ICON, KIND_WORD } from "./ui";

// The side panel's pieces: the item list, the selected item's settings and the number boxes.
// Flat colours only; every control is at least 44 px tall.

export function SectionHead({
  title,
  sub,
  right,
}: {
  title: string;
  sub?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-semibold tracking-tight text-white">{title}</h2>
        {sub ? <p className="mt-0.5 text-xs leading-relaxed text-white/60">{sub}</p> : null}
      </div>
      {right}
    </div>
  );
}

/**
 * A number box that changes the scene as you type (each valid number is applied; typing in one box
 * is one undo step). Shows the stored value again when you leave it.
 */
export function NumberField({
  label,
  value,
  unit,
  min,
  max,
  onChange,
  hint,
  decimals = 1,
}: {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  onChange: (v: number) => void;
  hint?: string;
  decimals?: number;
}) {
  const id = useId();
  const show = (v: number) => String(Number(v.toFixed(decimals)));
  const [text, setText] = useState(show(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(String(Number(value.toFixed(decimals))));
  }, [value, focused, decimals]);
  const parsed = Number(text.replace(",", "."));
  const bad = text.trim() === "" || !Number.isFinite(parsed) || parsed < min || parsed > max;
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1 block text-xs font-medium text-white/70">
        {label}
      </label>
      <div
        className={cn(
          "flex h-11 items-center rounded-xl border bg-[#0f1013] pr-3 focus-within:ring-2 focus-within:ring-[#f6c344]",
          bad && focused ? "border-rose-400/70" : "border-white/10",
        )}
      >
        <input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          className="h-full w-full min-w-0 bg-transparent px-3 text-sm text-white tabular-nums outline-none"
          value={text}
          aria-invalid={bad || undefined}
          title={hint}
          onFocus={(e) => {
            setFocused(true);
            e.currentTarget.select();
          }}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const step = (e.shiftKey ? 10 : 1) * (e.key === "ArrowUp" ? 1 : -1);
              const v = clamp((Number.isFinite(parsed) ? parsed : value) + step, min, max);
              setText(show(v));
              onChange(v);
            }
          }}
          onChange={(e) => {
            setText(e.target.value);
            const v = Number(e.target.value.replace(",", "."));
            if (e.target.value.trim() !== "" && Number.isFinite(v) && v >= min && v <= max)
              onChange(v);
          }}
        />
        <span className="shrink-0 text-xs text-white/50">{unit}</span>
      </div>
    </div>
  );
}

export function ItemList({
  items,
  infos,
  selected,
  onSelect,
  onToggle,
}: {
  items: SceneItem[];
  infos: Record<string, AssetInfo>;
  selected: string | null;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  if (!items.length)
    return (
      <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-white/60">
        Nothing here yet. Add a model, picture or video above.
      </p>
    );
  return (
    <ul className="space-y-1.5" aria-label="Items in the scene">
      {items.map((it) => {
        const Icon = KIND_ICON[it.kind];
        const info = infos[it.file];
        const on = it.id === selected;
        return (
          <li key={it.id} className="flex items-stretch gap-1.5">
            <button
              type="button"
              onClick={() => onSelect(it.id)}
              aria-pressed={on}
              className={cn(
                "flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-xl border px-3 text-left text-sm transition-colors focus-visible:ring-2 focus-visible:ring-[#f6c344] focus-visible:outline-none",
                on
                  ? "border-[#f6c344]/70 bg-[#f6c344]/12 text-white"
                  : "border-white/[0.08] bg-[#1d1e23] text-white/85 hover:bg-[#25262c]",
                !it.visible && "text-white/45",
              )}
            >
              <Icon
                aria-hidden
                className={cn("size-4 shrink-0", on ? "text-[#f6c344]" : "text-white/55")}
              />
              <span className="min-w-0 flex-1 truncate">{it.name}</span>
              {isHeavy(info) ? (
                <AlertTriangle
                  aria-label="May load slowly on phones"
                  className="size-4 shrink-0 text-amber-300"
                />
              ) : null}
              {info?.error ? (
                <AlertTriangle
                  aria-label="Couldn't load"
                  className="size-4 shrink-0 text-rose-300"
                />
              ) : null}
              <span className="shrink-0 text-xs text-white/45 tabular-nums">{mm(it.size)} mm</span>
            </button>
            <button
              type="button"
              className={cn(btn, "w-11 px-0")}
              onClick={() => onToggle(it.id)}
              aria-label={it.visible ? `Hide ${it.name}` : `Show ${it.name}`}
              title={it.visible ? "Hide" : "Show"}
            >
              {it.visible ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function Inspector({
  item,
  info,
  onChange,
  onDuplicate,
  onDelete,
  canDuplicate,
}: {
  item: SceneItem;
  info?: AssetInfo;
  onChange: (next: SceneItem, merge?: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  canDuplicate: boolean;
}) {
  const nameId = useId();
  const clipId = useId();
  const dims = itemDims(item, info);
  const setPos = (i: number, v: number) => {
    const pos = [...item.pos] as SceneItem["pos"];
    pos[i] = v;
    onChange({ ...item, pos }, `pos${i}:${item.id}`);
  };
  const setRot = (i: number, v: number) => {
    const rot = [...item.rot] as SceneItem["rot"];
    rot[i] = v;
    onChange({ ...item, rot }, `rot${i}:${item.id}`);
  };
  const Icon = KIND_ICON[item.kind];
  const heavy = isHeavy(info);
  return (
    <section className={card} aria-labelledby={`${nameId}-h`}>
      <div className="mb-3 flex items-center gap-2">
        <Icon aria-hidden className="size-4 text-[#f6c344]" />
        <h2 id={`${nameId}-h`} className="text-sm font-semibold">
          {KIND_WORD[item.kind]}
        </h2>
        <span className="ml-auto text-xs text-white/50 tabular-nums">
          {mm(dims.w)} x {mm(dims.h)}
          {item.kind === "model" ? ` x ${mm(dims.d)}` : ""} mm
        </span>
      </div>

      <label htmlFor={nameId} className="mb-1 block text-xs font-medium text-white/70">
        Name
      </label>
      <input
        id={nameId}
        className="h-11 w-full rounded-xl border border-white/10 bg-[#0f1013] px-3 text-sm text-white outline-none focus:ring-2 focus:ring-[#f6c344]"
        value={item.name}
        maxLength={80}
        onChange={(e) => onChange({ ...item, name: e.target.value }, `name:${item.id}`)}
      />

      {info ? (
        <div className="mt-3 text-xs text-white/60">
          {[
            info.bytes != null ? formatBytes(info.bytes) : null,
            info.triangles != null ? `${formatCount(info.triangles)} triangles` : null,
            item.aspect ? `shape ${item.aspect.toFixed(2)} : 1` : null,
          ]
            .filter(Boolean)
            .join(" · ")}
          {heavy ? (
            <p className="mt-2 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-amber-100">
              <AlertTriangle aria-hidden className="mt-0.5 size-4 shrink-0" />
              This may load slowly on phones. Aim for under 150k triangles and 5 MB.
            </p>
          ) : null}
          {info.error ? (
            <p className="mt-2 rounded-xl border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-rose-100">
              {info.error}
            </p>
          ) : null}
        </div>
      ) : null}

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-white/80 uppercase">
          Position (mm from the centre of the print)
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Right"
            unit="mm"
            value={item.pos[0]}
            min={-POS_LIMIT}
            max={POS_LIMIT}
            onChange={(v) => setPos(0, v)}
          />
          <NumberField
            label="Up"
            unit="mm"
            value={item.pos[1]}
            min={-POS_LIMIT}
            max={POS_LIMIT}
            onChange={(v) => setPos(1, v)}
          />
          <NumberField
            label="Out from the print"
            unit="mm"
            value={item.pos[2]}
            min={-POS_LIMIT}
            max={POS_LIMIT}
            onChange={(v) => setPos(2, v)}
          />
        </div>
      </fieldset>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-semibold tracking-wide text-white/80 uppercase">
          Turn (degrees)
        </legend>
        <div className="grid grid-cols-3 gap-2">
          <NumberField
            label="Tip forward"
            unit="°"
            value={item.rot[0]}
            min={-360}
            max={360}
            onChange={(v) => setRot(0, v)}
          />
          <NumberField
            label="Turn"
            unit="°"
            value={item.rot[1]}
            min={-360}
            max={360}
            onChange={(v) => setRot(1, v)}
          />
          <NumberField
            label="Spin"
            unit="°"
            value={item.rot[2]}
            min={-360}
            max={360}
            onChange={(v) => setRot(2, v)}
          />
        </div>
      </fieldset>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <NumberField
          label={item.kind === "model" ? "Height" : "Height of the picture"}
          unit="mm"
          value={item.size}
          min={SIZE_MIN}
          max={SIZE_MAX}
          onChange={(v) => onChange({ ...item, size: v }, `size:${item.id}`)}
        />
        {item.kind === "model" ? (
          <div className="min-w-0">
            <label htmlFor={clipId} className="mb-1 block text-xs font-medium text-white/70">
              Animation
            </label>
            <select
              id={clipId}
              className="h-11 w-full rounded-xl border border-white/10 bg-[#0f1013] px-2 text-sm text-white outline-none focus:ring-2 focus:ring-[#f6c344] disabled:opacity-50"
              value={item.clip ?? ""}
              disabled={!info?.clips?.length}
              onChange={(e) => onChange({ ...item, clip: e.target.value || null })}
            >
              <option value="">None</option>
              {(info?.clips ?? []).map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              {item.clip && info?.clips && !info.clips.includes(item.clip) ? (
                <option value={item.clip}>{item.clip} (not in this file)</option>
              ) : null}
            </select>
          </div>
        ) : null}
      </div>

      {item.kind === "video" ? (
        <label className="mt-3 flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-[#1d1e23] px-3 text-sm">
          <input
            type="checkbox"
            className="size-5 accent-[#f6c344]"
            checked={item.sound}
            onChange={(e) => onChange({ ...item, sound: e.target.checked })}
          />
          <span>
            Play with sound
            <span className="block text-xs text-white/55">
              Fans tap once to hear it. It plays muted here.
            </span>
          </span>
        </label>
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
        <button type="button" className={btn} onClick={() => onChange(centreOnPrint(item))}>
          <Crosshair aria-hidden />
          Centre on print
        </button>
        <button type="button" className={btn} onClick={() => onChange(sitFlat(item, info))}>
          <Layers aria-hidden />
          Sit flat on the print
        </button>
        <button type="button" className={btn} onClick={() => onChange(standUp(item, info))}>
          <RectangleVertical aria-hidden />
          Stand up on the print
        </button>
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2">
        <button type="button" className={btn} onClick={onDuplicate} disabled={!canDuplicate}>
          <Copy aria-hidden />
          Duplicate
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => onChange({ ...item, visible: !item.visible })}
        >
          {item.visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          {item.visible ? "Hide" : "Show"}
        </button>
        <button
          type="button"
          className={cn(btn, "border-rose-400/30 text-rose-200 hover:bg-rose-500/15")}
          onClick={onDelete}
        >
          <Trash2 aria-hidden />
          Delete
        </button>
      </div>
    </section>
  );
}
