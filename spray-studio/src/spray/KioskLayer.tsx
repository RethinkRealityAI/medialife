/**
 * Kiosk mode (?kiosk=1), for a big touchscreen at a pop-up or a mall: an attract screen until someone
 * touches it, and an idle reset so the next visitor starts on a clean piece (the last person's art and
 * share code never stay up). Tries to go full screen on the first touch.
 */
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { SprayCan } from 'lucide-react';

const IDLE_MS = 75_000; // no touch for this long: ask
const IDLE_SHARE_MS = 120_000; // longer while the share code is up (people are scanning)
const COUNTDOWN_S = 15;

export const KioskLayer: React.FC<{ busy: boolean; onReset: () => void }> = ({ busy, onReset }) => {
  const [attract, setAttract] = useState(true);
  const [count, setCount] = useState<number | null>(null);
  const last = useRef(Date.now());
  const busyRef = useRef(busy);
  busyRef.current = busy;
  const attractRef = useRef(attract);
  attractRef.current = attract;

  useEffect(() => {
    const touch = () => {
      last.current = Date.now();
      setCount(null);
    };
    window.addEventListener('pointerdown', touch, true);
    window.addEventListener('pointermove', touch, true);
    window.addEventListener('keydown', touch, true);
    const t = setInterval(() => {
      if (attractRef.current) return;
      const idle = Date.now() - last.current;
      const limit = busyRef.current ? IDLE_SHARE_MS : IDLE_MS;
      if (idle < limit) return;
      const left = COUNTDOWN_S - Math.floor((idle - limit) / 1000);
      if (left <= 0) {
        setCount(null);
        setAttract(true);
        onReset();
      } else setCount(left);
    }, 500);
    return () => {
      window.removeEventListener('pointerdown', touch, true);
      window.removeEventListener('pointermove', touch, true);
      window.removeEventListener('keydown', touch, true);
      clearInterval(t);
    };
  }, [onReset]);

  const begin = () => {
    setAttract(false);
    last.current = Date.now();
    try {
      if (!document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => {});
    } catch {
      /* not allowed: fine */
    }
  };

  return (
    <>
      <AnimatePresence>
        {attract && (
          <motion.button
            type="button"
            onClick={begin}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-6 bg-[#0f1519]/85 text-center backdrop-blur-sm"
            aria-label="Touch to start spraying"
          >
            <img src="/brand/evade-logo.webp" alt="EVADE" className="h-12" />
            <motion.div
              animate={{ rotate: [-8, 8, -8], y: [0, -10, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
              className="grid size-28 place-items-center rounded-full bg-[#f6c344] text-[#15131a]"
            >
              <SprayCan size={56} />
            </motion.div>
            <div className="text-[clamp(44px,8vw,110px)] leading-none text-[#f6c344]" style={{ fontFamily: '"Permanent Marker", cursive' }}>
              Touch to spray
            </div>
            <p className="max-w-xl px-6 text-[clamp(16px,2vw,26px)] text-white/80">
              Paint it your way, then scan the code to take your art home.
            </p>
          </motion.button>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {count !== null && !attract && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            role="status"
            className="pointer-events-none fixed bottom-10 left-1/2 z-[95] -translate-x-1/2 rounded-full bg-[#15131a] px-8 py-5 text-center text-xl font-semibold text-white shadow-2xl ring-2 ring-[#f6c344]"
          >
            Still painting? Touch the screen. Starting fresh in {count}…
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
