/**
 * Studio events go to the EVADE event stream (/api/bobo/events, source "spray-studio"), the same place the
 * Spray Bobo AR page reports to. Best effort, never blocks.
 */
const SID = Math.random().toString(36).slice(2, 12);
export function track(name: string, props?: Record<string, unknown>, roomId?: string) {
  try {
    const body = JSON.stringify({ type: 'custom', source: 'spray-studio', sessionId: SID, props: { action: name, room: roomId, ...props } });
    if (!(navigator.sendBeacon && navigator.sendBeacon('/api/bobo/events', new Blob([body], { type: 'application/json' }))))
      fetch('/api/bobo/events', { method: 'POST', body, keepalive: true, headers: { 'content-type': 'application/json' } }).catch(() => {});
  } catch {
    /* offline */
  }
}
export function flush() {}
export function installErrorCapture() {}
