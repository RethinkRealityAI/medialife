/**
 * The atmosphere picker: a round trigger that wears the current backdrop, and
 * a popover of flat pattern tiles, solid dots and a custom colour. Pops relative to
 * its trigger like the colour well, so it works from the header on wide
 * displays and from the view island on compact ones.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Pipette } from 'lucide-react';
import { sounds } from '../../utils/audio';
import {
  Atmosphere,
  CUSTOM_SOLID_ID,
  PATTERN_ATMOSPHERES,
  SOLID_ATMOSPHERES,
  atmospherePreview,
  customSolid,
} from './atmospheres';

export const AtmospherePicker: React.FC<{
  value: Atmosphere;
  onChange: (atmo: Atmosphere) => void;
  /** Where the popover opens relative to the trigger. */
  placement?: 'down' | 'right';
  size?: number;
}> = ({ value, onChange, placement = 'down', size = 38 }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const onOutside = (event: MouseEvent | TouchEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (atmo: Atmosphere) => {
    onChange(atmo);
    sounds.playClick(1.3);
  };

  const isCustom = value.kind === 'solid' && value.id === CUSTOM_SOLID_ID;

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          sounds.playClick(1.1);
        }}
        aria-label="Studio atmosphere"
        aria-expanded={open}
        title={`Atmosphere: ${value.name}`}
        style={{ width: size, height: size }}
        className={`tap glass rounded-full grid place-items-center ${open ? 'border-white/40' : ''}`}
      >
        <span
          aria-hidden
          className="block rounded-full"
          style={{
            width: size * 0.56,
            height: size * 0.56,
            background: atmospherePreview(value),
            boxShadow: `0 0 0 2px ${value.accent}`,
          }}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Choose an atmosphere"
            initial={{ opacity: 0, scale: 0.92, y: placement === 'down' ? -8 : 0, x: placement === 'right' ? -8 : 0 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.92, y: placement === 'down' ? -8 : 0, x: placement === 'right' ? -8 : 0 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            style={
              placement === 'down'
                ? { top: size + 10, right: 0, transformOrigin: 'top right' }
                : { left: size + 12, bottom: 0, transformOrigin: 'bottom left' }
            }
            className="absolute z-50 glass-modal rounded-[22px] p-3 w-[280px]"
          >
            <div className="mb-2 flex items-center justify-between px-0.5">
              <span className="mono-caps text-[9px] text-white/65">Backdrop</span>
              <span className="text-[11px] font-semibold text-white/85">{value.name}</span>
            </div>

            <div className="grid grid-cols-3 gap-1.5">
              {PATTERN_ATMOSPHERES.map((atmo) => {
                const selected = value.id === atmo.id;
                return (
                  <button
                    key={atmo.id}
                    type="button"
                    onClick={() => pick(atmo)}
                    aria-pressed={selected}
                    title={atmo.name}
                    className={`tap group relative overflow-hidden rounded-[14px] border text-left ${
                      selected ? 'border-[var(--studio-accent)] border-2' : 'border-white/15 hover:border-white/40'
                    }`}
                  >
                    <span aria-hidden className="block h-[46px] w-full" style={{ background: atmospherePreview(atmo) }} />
                    <span className="mono-caps block px-1.5 py-1 text-[8.5px] leading-tight text-white/85 truncate bg-black/40">
                      {atmo.short}
                    </span>
                    {selected && (
                      <span className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-[var(--studio-accent)] text-[var(--studio-on-accent)]">
                        <Check size={9} strokeWidth={3.5} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 mb-1.5 flex items-center justify-between px-0.5">
              <span className="mono-caps text-[9px] text-white/65">Solid</span>
              <button
                type="button"
                onClick={() => customRef.current?.click()}
                className={`tap rounded-full min-h-8 px-3 py-1 text-[10px] font-semibold flex items-center gap-1 ${
                  isCustom ? 'bg-white/25' : 'bg-white/10 hover:bg-white/20'
                }`}
              >
                <Pipette size={11} className="text-white/85" />
                Custom
              </button>
              <input
                ref={customRef}
                type="color"
                value={value.color}
                onChange={(e) => onChange(customSolid(e.target.value))}
                className="sr-only"
                aria-label="Custom solid colour"
              />
            </div>
            <div className="flex items-center gap-1.5">
              {SOLID_ATMOSPHERES.map((atmo) => {
                const selected = value.id === atmo.id;
                return (
                  <button
                    key={atmo.id}
                    type="button"
                    onClick={() => pick(atmo)}
                    aria-pressed={selected}
                    title={atmo.name}
                    className={`tap grid h-9 w-9 place-items-center rounded-full border ${
                      selected ? 'border-[var(--studio-accent)] border-2' : 'border-white/25 hover:border-white/55'
                    }`}
                    style={{ background: atmo.color }}
                  >
                    {selected && <Check size={11} strokeWidth={3.5} style={{ color: atmo.accent }} />}
                  </button>
                );
              })}
              {isCustom && (
                <span
                  className="grid h-9 w-9 place-items-center rounded-full border-2 border-[var(--studio-accent)]"
                  style={{ background: value.color }}
                  title="Custom"
                >
                  <Check size={11} strokeWidth={3.5} style={{ color: value.accent }} />
                </span>
              )}
            </div>
            <p className="mt-2.5 text-[10px] leading-snug text-white/60">
              Only your screen changes — phones keep their own view. Remembered on this device.
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
