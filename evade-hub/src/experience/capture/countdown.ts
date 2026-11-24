// The visible photo countdown (Selfie: 5 s; Classic: "Smile!" then 3, 2, 1) with a soft tick per number, and the flat
// white flash.
import { el } from './ui';
import { smileSound, tickSound } from './sounds';

export interface CountOpts {
  /** A word shown big first (Classic: "Smile!") for `leadS` seconds, then kept small above the numbers. */
  lead?: string;
  leadS?: number;
  /** The small line under the number ('' hides it). Default "Tap again to shoot now". */
  note?: string;
  /** A soft tick per number (default on). */
  sound?: boolean;
}

export class Countdown {
  private node: HTMLElement;
  private num: HTMLElement;
  private leadEl: HTMLElement;
  private noteEl: HTMLElement;
  private leadEnd = 0;
  private sound = true;
  /** Test hook: what was shown, in order ("Smile!", "3", "2", "1"). */
  readonly shown: string[] = [];
  private timer = 0;
  private endAt = 0;
  private last = -1;
  private resolve: ((shot: boolean) => void) | null = null;
  private onTick: ((left: number) => void) | null = null;

  constructor(parent: HTMLElement, private reduced: boolean) {
    this.node = el('div', 'cbc-count' + (reduced ? ' reduced' : ''), '<b class="cbc-lead"></b><span></span><small>Tap again to shoot now</small>');
    this.node.setAttribute('role', 'timer');
    this.node.setAttribute('aria-live', 'assertive');
    this.node.hidden = true;
    this.leadEl = this.node.querySelector('.cbc-lead') as HTMLElement;
    this.num = this.node.querySelector('span') as HTMLElement;
    this.noteEl = this.node.querySelector('small') as HTMLElement;
    parent.appendChild(this.node);
  }

  get running(): boolean {
    return !!this.resolve;
  }

  /**
   * Resolves true when it reaches zero (or `now()` was called), false if cancelled. `tick` gets seconds left (of the
   * numbers). With `opts.lead` the word shows first for `leadS` seconds, then `seconds` of numbers.
   */
  start(seconds: number, tick?: (left: number) => void, opts: CountOpts = {}): Promise<boolean> {
    this.cancel();
    this.onTick = tick ?? null;
    const leadS = opts.lead ? (opts.leadS ?? 0.9) : 0;
    const t0 = performance.now();
    this.leadEnd = t0 + leadS * 1000;
    this.endAt = this.leadEnd + seconds * 1000;
    this.last = -1;
    this.sound = opts.sound !== false;
    this.shown.length = 0;
    this.leadEl.textContent = opts.lead ?? '';
    this.leadEl.hidden = !opts.lead;
    const note = opts.note ?? 'Tap again to shoot now';
    this.noteEl.textContent = note;
    this.noteEl.hidden = !note;
    this.num.textContent = '';
    this.node.classList.toggle('leading', leadS > 0);
    this.node.dataset.phase = leadS > 0 ? 'lead' : '';
    this.node.hidden = false;
    if (leadS > 0) {
      this.shown.push(opts.lead!);
      this.pop(this.leadEl);
      if (this.sound) smileSound(this.reduced);
    }
    const p = new Promise<boolean>((r) => { this.resolve = r; });
    const step = () => {
      const now = performance.now();
      if (now < this.leadEnd) { this.timer = window.setTimeout(step, 50); return; }
      if (this.node.classList.contains('leading')) this.node.classList.remove('leading');
      const left = Math.max(0, (this.endAt - now) / 1000);
      const n = Math.ceil(left);
      if (n !== this.last && n > 0) {
        this.last = n;
        this.num.textContent = String(n);
        this.node.dataset.phase = String(n);
        this.shown.push(String(n));
        this.pop(this.num);
        if (this.sound) tickSound(this.reduced, n === 1);
      }
      this.onTick?.(left);
      if (left <= 0) return this.finish(true);
      this.timer = window.setTimeout(step, 50);
    };
    step();
    return p;
  }

  private pop(e: HTMLElement): void {
    if (this.reduced) return;
    e.classList.remove('pop');
    void e.offsetWidth; // restart the pop
    e.classList.add('pop');
  }

  /** Shoot now (second tap on the shutter). */
  now(): void {
    if (this.resolve) this.finish(true);
  }

  cancel(): void {
    if (this.resolve) this.finish(false);
  }

  private finish(shot: boolean): void {
    clearTimeout(this.timer);
    this.node.hidden = true;
    this.node.classList.remove('leading');
    this.node.dataset.phase = '';
    const r = this.resolve;
    this.resolve = null;
    this.onTick = null;
    r?.(shot);
  }

  dispose(): void {
    this.cancel();
    this.node.remove();
  }
}

/** A short flat white flash over everything (softer and longer-faded under reduced motion, never a hard blink). */
export function flash(container: HTMLElement, reduced: boolean): void {
  const f = el('div', 'cbc-flash');
  container.appendChild(f);
  requestAnimationFrame(() => {
    f.style.opacity = reduced ? '0.35' : '0.9';
    window.setTimeout(() => {
      f.style.transition = `opacity ${reduced ? 0.5 : 0.28}s ease-out`;
      f.style.opacity = '0';
      window.setTimeout(() => f.remove(), reduced ? 600 : 400);
    }, reduced ? 120 : 70);
  });
}
