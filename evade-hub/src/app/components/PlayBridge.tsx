import { useEffect, useRef } from 'react';
import type { PlayStatus } from '@/shared/contracts';
import { useApp, useController } from '../context';

/**
 * Always mounted (App.tsx): an in-hub quick game holds its round while the Arcade sheet is over the scene and carries
 * on (3, 2, 1) when it closes. Uses the experience's `holdPlay` (falls back to command('pause' | 'resume')).
 */
export function PlayBridge() {
  const c = useController();
  const started = useApp((s) => s.started);
  const sheetOpen = useApp((s) => s.sheetOpen);
  const state = useRef<PlayStatus['state']>('idle');
  const heldBySheet = useRef(false);
  useEffect(() => {
    const exp = c.experience;
    if (!exp || !started) return;
    return exp.on('play', (s) => {
      state.current = s.state;
      if (s.state === 'idle' || s.state === 'won' || s.state === 'over') heldBySheet.current = false;
    });
  }, [c, started]);
  useEffect(() => {
    const exp = c.experience as (NonNullable<typeof c.experience> & { holdPlay?: (on: boolean) => boolean }) | null;
    if (!exp) return;
    const hold = (on: boolean) => exp.holdPlay ? exp.holdPlay(on) : !!exp.command?.(on ? 'pause' : 'resume');
    if (sheetOpen && (state.current === 'playing' || state.current === 'countdown')) {
      heldBySheet.current = hold(true);
    } else if (!sheetOpen && heldBySheet.current) {
      heldBySheet.current = false;
      hold(false);
    }
  }, [c, sheetOpen]);
  return null;
}
