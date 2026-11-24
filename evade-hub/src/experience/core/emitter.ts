// A tiny typed event emitter.
export class Emitter<E extends object> {
  private map = new Map<keyof E, Set<(p: never) => void>>();

  on<K extends keyof E>(event: K, cb: (payload: E[K]) => void): () => void {
    let set = this.map.get(event);
    if (!set) this.map.set(event, (set = new Set()));
    set.add(cb as (p: never) => void);
    return () => set!.delete(cb as (p: never) => void);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    const set = this.map.get(event);
    if (!set) return;
    for (const cb of [...set]) {
      try {
        (cb as (p: E[K]) => void)(payload);
      } catch (err) {
        console.error(`[experience] "${String(event)}" listener threw`, err);
      }
    }
  }

  clear(): void {
    this.map.clear();
  }
}
