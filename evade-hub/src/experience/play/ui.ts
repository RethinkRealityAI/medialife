// The mini games' DOM: scoreboard, countdown, popups, streak counter, boost pill, pause and results cards.
// Built per game and removed on teardown (no listeners left behind). Plain DOM, theme tokens (play.css).
import './play.css';

import { BLOSSOM_SVG, blossomD } from '../../happi/blossom';
export const SVG = {
  heart: BLOSSOM_SVG,
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="m12 2.6 2.9 6 6.5.8-4.8 4.5 1.2 6.5L12 17.3l-5.8 3.1 1.2-6.5-4.8-4.5 6.5-.8Z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7 4.5h3.4v15H7zM13.6 4.5H17v15h-3.4z"/></svg>',
  clock: '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 2.5h5"/></g></svg>',
  run: `<svg viewBox="0 0 32 32" aria-hidden="true"><path fill="currentColor" d="${blossomD(19, 16.5, 11)}"/><g fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M2.5 10h4M1.5 15h3.5M2.5 20h3"/></g></svg>`,
  hoops: `<svg viewBox="0 0 32 32" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="3"><circle cx="19" cy="14" r="9"/></g><path fill="currentColor" d="${blossomD(8.5, 23.5, 6.5)}"/></svg>`,
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export interface Results {
  title: string;
  score: number;
  best: number;
  newBest: boolean;
  stars: number;
  line: string;
}

export class PlayUi {
  readonly board: HTMLElement;
  private scoreEl: HTMLElement;
  private timeEl: HTMLElement | null = null;
  private timeNum: HTMLElement | null = null;
  private balls: HTMLElement[] = [];
  private rack: HTMLElement | null = null;
  private rackN = 0;
  private rackUsed = -1;
  private countEl: HTMLElement;
  private countSub: HTMLElement;
  private streakEl: HTMLElement;
  private streakN: HTMLElement;
  private streakT = 0;
  private powerEl: HTMLElement;
  private powerBar: HTMLElement;
  private card: HTMLElement | null = null;
  private pops: HTMLElement[] = [];
  private lastScore = -1;
  private lastTime = -1;

  constructor(private layer: HTMLElement, private root: HTMLElement, opts: { label: string; clock: boolean; balls?: number; onPause(): void }) {
    this.board = el('div', 'cbp-board');
    this.board.setAttribute('role', 'status');
    const pause = el('button', 'cbp-pause', SVG.pause);
    pause.type = 'button';
    pause.setAttribute('aria-label', `Pause ${opts.label}`);
    pause.addEventListener('click', (e) => { e.stopPropagation(); opts.onPause(); });
    this.board.appendChild(pause);
    const score = el('div', 'cbp-score', `${SVG.heart}<b>0</b>`);
    score.setAttribute('aria-label', 'Score');
    this.scoreEl = score.querySelector('b')!;
    this.board.appendChild(score);
    if (opts.clock) {
      this.timeEl = el('div', 'cbp-time', `${SVG.clock}<b>60</b>`);
      this.timeEl.setAttribute('aria-label', 'Seconds left');
      this.timeNum = this.timeEl.querySelector('b')!;
      this.board.appendChild(this.timeEl);
    }
    if (opts.balls) {
      // the hearts you have left (Heart Hoops): a big rack at the bottom, under the heart in your hand (polish-4: the
      // tiny row in the scoreboard did not say "these are what you throw"). The last one is gold and counts double.
      const row = el('div', 'cbp-rack');
      row.setAttribute('role', 'img');
      this.rack = row;
      this.rackN = opts.balls;
      for (let i = 0; i < opts.balls; i++) {
        const last = i === opts.balls - 1;
        const b = el('i', last ? 'x2' : '', SVG.heart + (last ? '<em>x2</em>' : ''));
        this.balls.push(b);
        row.appendChild(b);
      }
    }
    this.countEl = el('div', 'cbp-count');
    this.countEl.setAttribute('aria-live', 'assertive');
    this.countSub = el('div', 'cbp-count-sub');
    this.countSub.hidden = true;
    this.streakEl = el('div', 'cbp-streak', `${SVG.heart}<b>0</b><span>in a row</span>`);
    this.streakN = this.streakEl.querySelector('b')!;
    this.powerEl = el('div', 'cbp-power', '<span></span><i class="bar"></i>');
    this.powerBar = this.powerEl.querySelector('.bar')!;
    layer.append(this.board, this.countEl, this.countSub, this.streakEl, this.powerEl);
    if (this.rack) layer.appendChild(this.rack);
    root.classList.add('cbp-on');
    requestAnimationFrame(() => this.board.classList.add('on'));
  }

  setScore(n: number): void {
    if (n === this.lastScore) return;
    const up = n > this.lastScore && this.lastScore >= 0;
    this.lastScore = n;
    this.scoreEl.textContent = String(n);
    if (up) {
      this.scoreEl.classList.remove('bump');
      void this.scoreEl.offsetWidth;
      this.scoreEl.classList.add('bump');
    }
  }

  setTime(s: number): void {
    if (!this.timeEl || !this.timeNum) return;
    const v = Math.max(0, Math.ceil(s));
    if (v === this.lastTime) return;
    this.lastTime = v;
    this.timeNum.textContent = String(v);
    this.timeEl.classList.toggle('low', v <= 10 && v > 0);
  }

  /** Hoops: which hearts are used, which is next. */
  setBalls(used: number): void {
    this.balls.forEach((b, i) => { b.classList.toggle('used', i < used); b.classList.toggle('now', i === used); });
    if (this.rack && used !== this.rackUsed) {
      // the one that just left your hand pops out of the rack
      if (used > this.rackUsed && this.rackUsed >= 0) {
        const gone = this.balls[used - 1];
        gone?.classList.remove('out');
        void gone?.offsetWidth;
        gone?.classList.add('out');
      }
      this.rackUsed = used;
      const left = Math.max(0, this.rackN - used);
      this.rack.setAttribute('aria-label', `${left} blossom${left === 1 ? '' : 's'} left to throw`);
    }
  }

  /** Show or hide the rack (results card up: hidden). */
  showRack(on: boolean): void {
    this.rack?.classList.toggle('off', !on);
  }

  /** 3, 2, 1, Go! (text '' hides). `sub` is a short line under it (e.g. "Collect the hearts!"). */
  count(text: string, sub = ''): void {
    const c = this.countEl;
    c.textContent = text;
    c.classList.toggle('go', !!text && !/^\d$/.test(text));
    c.classList.remove('beat');
    if (text) { void c.offsetWidth; c.classList.add('beat'); }
    this.countSub.hidden = !sub;
    this.countSub.textContent = sub;
  }

  streak(n: number): void {
    if (n < 3) { this.streakEl.classList.remove('on', 'big'); return; }
    this.streakN.textContent = String(n);
    const e = this.streakEl;
    e.classList.toggle('big', n >= 8);
    e.classList.add('on');
    e.classList.remove('pop');
    void e.offsetWidth;
    e.classList.add('pop');
    this.streakT = 2.2;
  }

  /** A timed power-up (k 1..0); null hides. */
  power(label: string | null, k = 1, rainbow = false): void {
    const e = this.powerEl;
    if (!label) { e.classList.remove('on'); return; }
    (e.firstElementChild as HTMLElement).textContent = label;
    e.classList.toggle('rainbow', rainbow);
    e.classList.add('on');
    this.powerBar.style.transform = `scaleX(${Math.max(0, Math.min(1, k)).toFixed(3)})`;
  }

  /** "+1" at a screen point (container px). */
  pop(x: number, y: number, text: string, kind = '', small = ''): void {
    const p = el('div', 'cbp-pop' + (kind ? ' ' + kind : ''), `${esc(text)}${small ? `<small>${esc(small)}</small>` : ''}`);
    p.style.setProperty('--x', `${Math.round(x)}px`);
    p.style.setProperty('--y', `${Math.round(y)}px`);
    this.layer.appendChild(p);
    this.pops.push(p);
    const done = () => { p.remove(); this.pops = this.pops.filter((q) => q !== p); };
    p.addEventListener('animationend', done, { once: true });
    window.setTimeout(done, 1600);
    if (this.pops.length > 6) this.pops.shift()?.remove();
  }

  tick(dt: number): void {
    if (this.streakT > 0 && (this.streakT -= dt) <= 0) this.streakEl.classList.remove('on', 'big');
  }

  // ------------------------------------------------------------------ cards
  pauseCard(onResume: () => void, onQuit: () => void, extra: HTMLElement | null = null): void {
    this.closeCard();
    const w = el('div', 'cbp-wrap');
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', 'true');
    w.setAttribute('aria-label', 'Paused');
    w.innerHTML = `<div class="cbp-card"><h2>Paused</h2><p>Take a breather. Ready when you are!</p>
      <div class="cbp-row"><button type="button" class="cbp-btn" data-a="go">Resume</button><button type="button" class="cbp-btn alt" data-a="quit">End game</button></div></div>`;
    w.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'go') onResume();
      if (a === 'quit') onQuit();
    });
    if (extra) w.querySelector('.cbp-row')?.before(extra);
    this.root.appendChild(w);
    this.card = w;
    (w.querySelector('.cbp-btn') as HTMLElement).focus({ preventScroll: true });
  }

  resultsCard(r: Results, onAgain: () => void, onDone: () => void): void {
    this.closeCard();
    const w = el('div', 'cbp-wrap');
    w.setAttribute('role', 'dialog');
    w.setAttribute('aria-modal', 'true');
    w.setAttribute('aria-label', `${r.title}: ${r.score} points, ${r.stars} of 3 stars`);
    const stars = [0, 1, 2].map((i) => `<i class="${i < r.stars ? 'on' : ''}">${SVG.star}</i>`).join('');
    w.innerHTML = `<div class="cbp-card"><div class="cbp-stars" aria-hidden="true">${stars}</div><h2>${esc(r.title)}</h2>
      <div class="cbp-big">${r.score}<small>points</small></div><p>${esc(r.line)}</p>
      <span class="cbp-best${r.newBest ? ' new' : ''}">${SVG.star.replace('<svg', '<svg width="16" height="16"')}${r.newBest ? 'New best!' : `Best ${r.best}`}</span>
      <div class="cbp-row"><button type="button" class="cbp-btn" data-a="again">Play again</button><button type="button" class="cbp-btn alt" data-a="done">Done</button></div></div>`;
    w.addEventListener('click', (e) => {
      e.stopPropagation();
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'again') onAgain();
      if (a === 'done') onDone();
    });
    this.root.appendChild(w);
    this.card = w;
    (w.querySelector('.cbp-btn') as HTMLElement).focus({ preventScroll: true });
  }

  closeCard(): void {
    this.card?.remove();
    this.card = null;
  }
  get cardOpen(): boolean {
    return !!this.card;
  }

  /** Hide the in-play bits (results showing). */
  hidePlay(): void {
    this.count('');
    this.streak(0);
    this.power(null);
    this.showRack(false);
  }

  dispose(): void {
    this.closeCard();
    for (const p of this.pops) p.remove();
    this.pops = [];
    for (const n of [this.board, this.countEl, this.countSub, this.streakEl, this.powerEl, this.rack]) n?.remove();
    this.root.classList.remove('cbp-on');
  }
}
