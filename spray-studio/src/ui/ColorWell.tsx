/**
 * Colour picker.
 *
 * Replaces the old radial picker, which opened a fixed-position panel anchored
 * to the viewport corner — that worked on the studio screen but collided with
 * the controller's own bottom dock. This one pops relative to its trigger and
 * is sized for thumbs.
 */
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Check, Pipette } from 'lucide-react';
import { sounds } from '../utils/audio';

/** The Spray Bobo caps, in cap-rail order. `ink` marks swatches that need ink type on top. */
export const PALETTE = [
  { name: 'EVADE yellow', hex: '#F6C344', ink: true },
  { name: 'Bobo blue', hex: '#3F9BE6', ink: true },
  { name: 'Sky', hex: '#8CC8F8', ink: true },
  { name: 'Magenta', hex: '#E85BD8', ink: true },
  { name: 'Red', hex: '#FF3B4E', ink: true },
  { name: 'Orange', hex: '#FF8A2A', ink: true },
  { name: 'Green', hex: '#3DDC84', ink: true },
  { name: 'Purple', hex: '#7A5CFF', ink: false },
  { name: 'White', hex: '#FFFFFF', ink: true },
  { name: 'Black', hex: '#000000', ink: false },
];

const RING = PALETTE.slice(0, 4).map((swatch) => swatch.hex);
const POPOVER_WIDTH = 236;

export const ColorWell: React.FC<{
  color: string;
  onChange: (hex: string) => void;
  /** Opens upward (studio dock) or downward (controller header). */
  placement?: 'up' | 'down';
  size?: number;
}> = ({ color, onChange, placement = 'up', size = 38 }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const customRef = useRef<HTMLInputElement>(null);
  // The popover is portalled to <body> with fixed coordinates, so a rail card
  // or dock with overflow:hidden can never clip it.
  const [anchor, setAnchor] = useState<React.CSSProperties>({});

  useEffect(() => {
    if (!open) return;
    const place = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      const vertical =
        placement === 'up' ? { bottom: window.innerHeight - rect.top + 10 } : { top: rect.bottom + 10 };
      // Right-aligned to the trigger unless that would run off the left edge.
      const horizontal =
        rect.right - POPOVER_WIDTH < 8
          ? { left: Math.max(8, rect.left) }
          : { right: Math.max(8, window.innerWidth - rect.right) };
      setAnchor({ ...vertical, ...horizontal });
    };
    place();
    const onOutside = (event: MouseEvent | TouchEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('resize', place);
    document.addEventListener('mousedown', onOutside);
    document.addEventListener('touchstart', onOutside);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', place);
      document.removeEventListener('mousedown', onOutside);
      document.removeEventListener('touchstart', onOutside);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, placement]);

  const pick = (hex: string) => {
    onChange(hex);
    sounds.playClick(1.5);
    if (navigator.vibrate) navigator.vibrate(12);
    setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          sounds.playClick(1.2);
        }}
        style={{ width: size, height: size }}
        aria-label="Choose colour"
        aria-expanded={open}
        className="tap relative rounded-full p-[3px] grid place-items-center"
      >
        {/* A flat ring of the four lead caps instead of a rainbow wheel. */}
        <svg aria-hidden viewBox="0 0 36 36" className="absolute inset-0 h-full w-full" style={{ opacity: open ? 1 : 0.9 }}>
          {RING.map((hex, i) => (
            <circle
              key={hex}
              cx="18"
              cy="18"
              r="16"
              fill="none"
              stroke={hex}
              strokeWidth="4"
              pathLength={100}
              strokeDasharray="25 75"
              strokeDashoffset={-25 * i}
              transform="rotate(-90 18 18)"
            />
          ))}
        </svg>
        <span
          className="relative w-full h-full rounded-full border-2 border-[#15131a]"
          style={{ background: color }}
        />
      </button>

      {createPortal(
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: placement === 'up' ? 8 : -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: placement === 'up' ? 8 : -8 }}
            transition={{ type: 'spring', stiffness: 460, damping: 34 }}
            ref={popRef}
            role="dialog"
            aria-label="Paint colours"
            style={{ ...anchor, width: POPOVER_WIDTH }}
            className="fixed z-[80] glass-modal rounded-[22px] p-3"
          >
            <div className="flex items-center justify-between mb-2.5">
              <span className="label-caps text-white/65">Paint caps</span>
              <button
                type="button"
                onClick={() => customRef.current?.click()}
                className="tap rounded-full min-h-8 px-3 py-1 bg-white/10 hover:bg-white/20 text-[10px] font-semibold flex items-center gap-1"
              >
                <Pipette size={11} className="text-[var(--color-evade-sky)]" />
                Custom
              </button>
              <input
                ref={customRef}
                type="color"
                value={color}
                onChange={(e) => onChange(e.target.value)}
                className="sr-only"
                aria-label="Custom colour"
              />
            </div>

            <div className="grid grid-cols-5 gap-2">
              {PALETTE.map((swatch) => {
                const selected = swatch.hex.toLowerCase() === color.toLowerCase();
                return (
                  <button
                    key={swatch.hex}
                    type="button"
                    onClick={() => pick(swatch.hex)}
                    title={swatch.name}
                    aria-label={swatch.name}
                    aria-pressed={selected}
                    className={`tap w-9 h-9 rounded-full grid place-items-center border-2 ${
                      selected ? 'border-[#f6c344] outline-2 outline-offset-1 outline-[#15131a]' : 'border-white/20 hover:scale-110'
                    }`}
                    style={{ background: swatch.hex }}
                  >
                    {selected && (
                      <Check
                        size={12}
                        strokeWidth={3.5}
                        className={swatch.ink ? 'text-[#15131a]' : 'text-white'}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              <span className="text-[10px] font-mono text-white/70">
                {PALETTE.find((s) => s.hex.toLowerCase() === color.toLowerCase())?.name ?? 'Custom'} · {color.toUpperCase()}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>,
        document.body
      )}
    </div>
  );
};
