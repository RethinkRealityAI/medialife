import type { CallStatus } from '@/shared/contracts';

export function formatClock(ms: number): string {
  const t = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

/** Short status line for the sheet header (the in-call timer is rendered live by CallTimer). */
export function callStatusText(call: CallStatus, startedAt: number | null): string {
  switch (call) {
    case 'connecting': return 'Calling…';
    case 'ringing': return 'Ringing…';
    case 'in-call': return startedAt ? 'On a call' : 'Connected';
    case 'ending': return 'Hanging up…';
    case 'error': return 'Call did not connect';
    default: return 'Ready to talk';
  }
}
