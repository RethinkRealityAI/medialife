/** Minimal typed event emitter for the mocks. */
export class Emitter<E extends object> {
  private handlers = new Map<keyof E, Set<(p: never) => void>>();
  on<K extends keyof E>(event: K, cb: (payload: E[K]) => void): () => void {
    let set = this.handlers.get(event);
    if (!set) this.handlers.set(event, (set = new Set()));
    set.add(cb as (p: never) => void);
    return () => { set!.delete(cb as (p: never) => void); };
  }
  emit<K extends keyof E>(event: K, payload: E[K]): void {
    this.handlers.get(event)?.forEach((cb) => {
      try { (cb as (p: E[K]) => void)(payload); } catch (err) { console.error('[mock] handler failed', err); }
    });
  }
  clear(): void { this.handlers.clear(); }
}

export const params = (): URLSearchParams =>
  new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
