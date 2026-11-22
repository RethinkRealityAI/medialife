// Bobo's Actions as a fan (Dapo, 2026-11-22): instead of a full sheet that hides him, the Actions button (bottom
// right) opens two quarter rings of round buttons around itself, like the paw fan in Cola Run's hideout. Bobo stays in
// full view in the middle of the screen; a tap plays the move and the fan stays open so you can try the next one
// (the move that is playing is lit). Tap the Actions button again, the scene, or wait 8 s idle to fold it away.
import { MOVES } from './moves';
import { haptic } from './haptics';

const CSS = `
.bobo-fan{position:fixed;z-index:40;width:0;height:0;pointer-events:none}
.bobo-fan .it{position:absolute;left:0;top:0;width:64px;margin:-26px 0 0 -32px;display:flex;flex-direction:column;align-items:center;gap:3px;
  transform:translate(0,0) scale(.3);opacity:0;transition:transform .3s cubic-bezier(.2,1.5,.4,1),opacity .18s;pointer-events:none}
.bobo-fan.open .it{transform:translate(var(--x),var(--y)) scale(1);opacity:1;transition-delay:calc(var(--i) * 30ms)}
.bobo-fan.open .it button{pointer-events:auto}
.bobo-fan button{width:52px;height:52px;padding:0;border-radius:50%;display:grid;place-items:center;color:#fff;cursor:pointer;
  border:1px solid rgba(255,255,255,.22);background:rgba(15,21,25,.86);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);
  box-shadow:0 6px 18px rgba(0,0,0,.4);-webkit-tap-highlight-color:transparent;transition:background .15s,border-color .15s,transform .1s}
.bobo-fan button:active{transform:scale(.92)}
.bobo-fan button svg{width:24px;height:24px}
.bobo-fan button.on{background:#f6c344;border-color:#f6c344;color:#15131a}
.bobo-fan button:focus-visible{outline:2px solid #fff;outline-offset:3px}
.bobo-fan .it b{font:700 11px/1.3 "Space Grotesk",system-ui,sans-serif;color:#fff;padding:1px 7px;border-radius:999px;background:rgba(10,12,16,.72);white-space:nowrap}
@media (prefers-reduced-motion: reduce){.bobo-fan .it{transition:opacity .15s}}
`;

export interface FanHost {
  /** Play a move by moment name; returns true when it started. */
  trigger(name: string): void;
  /** The moment playing now (to light its button), or null. */
  current(): string | null;
}

export class ActionFan {
  private el: HTMLDivElement | null = null;
  private anchor: HTMLElement | null = null;
  private raf = 0;
  private idle = 0;
  private offDown: (() => void) | null = null;
  /** Called with true when the fan opens and false when it folds (3D slides Bobo to the left meanwhile). */
  onOpen: ((open: boolean) => void) | null = null;
  constructor(private host: FanHost) {}

  get open(): boolean { return !!this.el?.classList.contains('open'); }

  toggle(anchor: HTMLElement | null): void {
    if (this.open) this.close();
    else if (anchor) this.show(anchor);
  }

  private show(anchor: HTMLElement): void {
    if (!document.getElementById('bobo-fan-css')) {
      const s = document.createElement('style');
      s.id = 'bobo-fan-css';
      s.textContent = CSS;
      document.head.appendChild(s);
    }
    this.anchor = anchor;
    const el = (this.el ??= document.createElement('div'));
    el.className = 'bobo-fan';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'What should Bobo do?');
    // two quarter rings, sweeping from the left of the button up to above it: 3 inside, 5 outside (room for labels)
    const inner = MOVES.slice(0, 3), outer = MOVES.slice(3);
    const ring = (list: typeof MOVES, r: number, a0: number, a1: number, i0: number) => list.map((m, k) => {
      const a = ((a0 + ((a1 - a0) * k) / Math.max(1, list.length - 1)) * Math.PI) / 180;
      const x = Math.cos(a) * r, y = -Math.sin(a) * r;
      return `<div class="it" style="--x:${x.toFixed(1)}px;--y:${y.toFixed(1)}px;--i:${i0 + k}"><button type="button" role="menuitem" data-move="${m.name}" aria-label="${m.label}">${m.icon}</button><b>${m.label}</b></div>`;
    }).join('');
    el.innerHTML = ring(inner, 106, 176, 96, 0) + ring(outer, 200, 183, 88, 3);
    document.body.appendChild(el);
    this.place();
    el.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation();
      this.idle = 0;
      haptic('tap');
      this.host.trigger(b.dataset.move!);
    }));
    requestAnimationFrame(() => el.classList.add('open'));
    this.onOpen?.(true);
    anchor.setAttribute('aria-expanded', 'true');
    // tap anywhere else (the scene, other buttons) folds it away; the Actions button itself toggles
    const down = (e: PointerEvent) => {
      const t = e.target as Node;
      if (el.contains(t) || anchor.contains(t)) return;
      this.close();
    };
    window.addEventListener('pointerdown', down, true);
    this.offDown = () => window.removeEventListener('pointerdown', down, true);
    this.idle = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      const cur = this.host.current();
      if (cur) this.idle = 0; else this.idle += dt;
      el.querySelectorAll<HTMLButtonElement>('[data-move]').forEach((b) => b.classList.toggle('on', b.dataset.move === cur));
      if (!anchor.isConnected || anchor.offsetParent === null || this.idle > 8) { this.close(); return; }
      this.place();
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  private place(): void {
    if (!this.el || !this.anchor) return;
    const r = this.anchor.getBoundingClientRect();
    this.el.style.left = `${r.left + r.width / 2}px`;
    this.el.style.top = `${r.top + r.height / 2 - 6}px`;
  }

  close(): void {
    cancelAnimationFrame(this.raf);
    this.offDown?.();
    this.offDown = null;
    this.anchor?.setAttribute('aria-expanded', 'false');
    const el = this.el;
    if (!el) return;
    if (el.classList.contains('open')) this.onOpen?.(false);
    el.classList.remove('open');
    window.setTimeout(() => { if (!el.classList.contains('open')) el.remove(); }, 320);
  }
}
