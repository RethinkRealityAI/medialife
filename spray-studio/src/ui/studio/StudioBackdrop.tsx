/**
 * The studio backdrop.
 *
 * Sits behind the transparent WebGL canvas: one flat colour from the chosen
 * atmosphere and, for pattern presets, a sparse flat pattern drifting very
 * slowly (one tile every 90s, on the compositor). No gradients, no blur. The
 * colour comes from `--studio-ink` on the studio root
 * (`src/ui/studio/atmospheres.ts`); the layers are CSS in `src/index.css`.
 * Switching crossfades: the outgoing backdrop fades under the incoming one.
 */
import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PATTERN_TILE, patternImage, type Atmosphere } from './atmospheres';

export const StudioBackdrop: React.FC<{ atmosphere: Atmosphere }> = ({ atmosphere }) => {
  const key = atmosphere.kind === 'solid' ? `${atmosphere.id}:${atmosphere.color}` : atmosphere.id;
  return (
    <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
      <AnimatePresence initial={false}>
        <motion.div
          key={key}
          className="studio-backdrop"
          style={{ background: atmosphere.color }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.7, ease: 'easeInOut' }}
        >
          {atmosphere.kind === 'pattern' && (
            <div
              className="studio-pattern"
              style={
                {
                  '--tile': `${PATTERN_TILE}px`,
                  backgroundImage: patternImage(atmosphere),
                  backgroundSize: `${PATTERN_TILE}px ${PATTERN_TILE}px`,
                } as React.CSSProperties
              }
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};
