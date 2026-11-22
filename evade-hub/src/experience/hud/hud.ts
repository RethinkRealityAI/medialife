// The experience's own DOM: splash, top bar (small title, mode switcher, menu), hint pill, toast, speech bubble,
// bottom row (left: Move; centre: joystick or shutter; right: kept free for the app's talk button), sheets (menu,
// how it works, licences, open-on-phone QR, errors) and the flat cover shown while the camera switches.
import { recorder, CLIP_MAX_S } from '../capture/recorder';
import { ARCADE_SVG, BOBO_HEAD_SVG, BRAND, titleHtml } from '../../evade/brand/brand';
import { PixelField } from '../../evade/brand/splash-fx';
import * as THREE from 'three';
import qrcode from 'qrcode-generator';
import type { ExperienceMode } from '../../shared/contracts';
import type { HudApi } from '../types';
import { ICON } from './icons';
import './hud.css';

const MODES: Array<{ id: ExperienceMode; label: string; icon: string; aria: string }> = [
  { id: 'showcase', label: '3D', icon: ICON.cube, aria: "3D: Bobo's Hideout" },
  { id: 'ar', label: 'AR', icon: ICON.ar, aria: 'AR: Bobo in your room' },
  { id: 'face', label: 'Selfie', icon: ICON.selfie, aria: 'Selfie with Bobo looks' },
  { id: 'photo', label: 'Photo', icon: ICON.photo, aria: 'Photo with Bobo' },
];

/** Press-and-hold video on a shutter: start() returns false when this view can't record right now. */
export interface ShutterHold {
  start(): boolean;
  stop(): void;
}

export interface HudOptions {
  title: string;
  lead: string;
  onStart(): void;
  onSwitch(mode: ExperienceMode): void;
  onRestart(): void;
}

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

/** Bobo's head hopping on a cyan disc (loading glyph on the splash + the mode-change cover). Flat, code-drawn. */
function headHop(cls: string): string {
  return `<div class="hh ${cls}" aria-hidden="true"><i class="hh-ring"></i><i class="hh-shadow"></i><span class="hh-head">${BOBO_HEAD_SVG}</span></div>`;
}

/** Fired on window by the menu's "Bobo's Arcade" item; the app (src/app) opens the Arcade sheet. */
export const OPEN_ARCADE_EVENT = 'evade:open-arcade';

export class Hud implements HudApi {
  readonly root: HTMLElement;
  readonly hudEl: HTMLElement;
  readonly left: HTMLElement;
  readonly right: HTMLElement;
  readonly centre: HTMLElement;
  readonly above: HTMLElement;
  readonly layer: HTMLElement;
  private splash: HTMLElement;
  private petals: PixelField;
  private startBtn: HTMLButtonElement;
  private loadBar: HTMLElement;
  private hintEl: HTMLElement;
  private hintT = 0;
  private toastEl: HTMLElement;
  private bubble: HTMLElement;
  private bubbleWords: HTMLElement;
  private bubbleSr: HTMLElement;
  private speechWords: string[] = [];
  private speechT = 0;
  private coverEl: HTMLElement;
  private coverDisc: HTMLElement;
  private coverIcon: HTMLElement;
  private coverText: HTMLElement;
  private coverTitle: HTMLElement;
  private coverOutT = 0;
  private coverOnAt = 0;
  private flashEl: HTMLElement;
  private switchEl: HTMLElement;
  private switchPill: HTMLElement;
  private switchBtns = new Map<ExperienceMode, HTMLButtonElement>();
  private curMode: ExperienceMode = 'showcase';
  private busy = false;
  /** A mode tapped while a switch was running: the last tap wins once the switch ends. */
  private pending: ExperienceMode | null = null;
  /** Where the mode-change iris grows from (the tapped tab's centre, in container px). */
  private irisFrom: { x: number; y: number } | null = null;
  private stick: HTMLElement;
  private stickKnob: HTMLElement;
  private stickState = { vector: new THREE.Vector2(), active: false };
  private toastT = 0;
  private hintText = '';
  private openSheets: HTMLElement[] = [];

  /** The page title shown on the splash, top bar and menu. */
  readonly title: string;

  constructor(container: HTMLElement, private opts: HudOptions) {
    this.root = container;

    // ---- splash (full branded, EVADE): logo, the hero window (Bobo in his hideout, drawn by the showcase behind the
    // transparent window), kicker, title with the last word in cyan, one-line lead, yellow Start, loading bar,
    // Activated by MEDIALIFE. No instructions or licence text here (house rules).
    const title = opts.title || BRAND.title;
    const lead = opts.lead || BRAND.lead;
    this.title = title;
    this.splash = el('section', 'cbx-splash');
    this.splash.setAttribute('aria-label', title);
    this.splash.innerHTML = `
      <div class="sp-col">
        <div class="sp-top"><img class="sp-logo" src="${BRAND.logo}" alt="EVADE" width="600" height="150" decoding="async"></div>
        <div class="sp-bottom">
          <p class="sp-kicker">EVADE <i aria-hidden="true"></i> Bobo's Arcade</p>
          <h1 class="sp-title">${titleHtml(title, esc)}</h1>
          <p class="lead">${esc(lead)}</p>
          <button type="button" class="cbx-start" disabled>Loading…</button>
          <div class="cbx-load" role="progressbar" aria-label="Loading" aria-valuemin="0" aria-valuemax="100"><i></i></div>
          <img class="act-by" src="${BRAND.activatedBy}" alt="Activated by MEDIALIFE" width="148" height="58" decoding="async">
        </div>
      </div>
      <div class="sp-hero"><i class="sp-corner tl"></i><i class="sp-corner tr"></i><i class="sp-corner bl"></i><i class="sp-corner br"></i><div class="sp-wait" aria-hidden="true">${headHop('hh-sm')}</div></div>`;
    // portrait order: logo, hero window, copy (the column wrapper is display: contents there)
    const col = this.splash.querySelector('.sp-col')!;
    const hero = this.splash.querySelector('.sp-hero')!;
    col.insertBefore(hero, col.querySelector('.sp-bottom'));
    if (matchMedia('(min-aspect-ratio: 1/1) and (min-width: 700px)').matches) this.splash.appendChild(hero);
    this.startBtn = this.splash.querySelector('.cbx-start')!;
    this.loadBar = this.splash.querySelector('.cbx-load')!;
    this.startBtn.addEventListener('click', () => opts.onStart());
    // flat arcade pixels drifting up behind everything (src/evade/brand/splash-fx.ts)
    this.petals = new PixelField(this.splash);
    this.petals.start();

    // ---- HUD
    this.hudEl = el('div', 'cbx-hud');
    this.hudEl.hidden = true;
    // top (the hub's round 5/6 layout, EVADE look): row 1 = the EVADE lockup (logo + "Bobo's Hideout" in Exo 2 italic)
    // and the menu; row 2 = the mode tabs.
    const top = el('div', 'cbx-top');
    const dock = el('nav', 'cbx-dock');
    dock.setAttribute('aria-label', 'Views and menu');
    const row1 = el('div', 'cbx-row1');
    const lockup = el('div', 'lockup');
    lockup.setAttribute('role', 'img');
    lockup.setAttribute('aria-label', `EVADE, ${title}`);
    lockup.innerHTML = `<img class="wm" src="${BRAND.logo}" alt="" width="600" height="150"><i class="sep" aria-hidden="true"></i><b class="nm" aria-hidden="true">${titleHtml(title, esc)}</b>`;
    row1.appendChild(lockup);
    dock.appendChild(row1);
    top.append(dock);
    // Mode switcher: a tablist with ONE sliding selection pill (transform only, so it springs at 60 fps with no
    // layout). Manual activation: arrow keys move focus, Enter / Space switch (each switch may start a camera).
    this.switchEl = el('div', 'cbx-switch');
    this.switchEl.setAttribute('role', 'tablist');
    this.switchEl.setAttribute('aria-label', 'View');
    this.switchPill = el('span', 'cbx-switch-pill', '<i></i>');
    this.switchPill.setAttribute('aria-hidden', 'true');
    this.switchEl.appendChild(this.switchPill);
    MODES.forEach((m, i) => {
      const b = el('button', '', `${m.icon}<span>${m.label}</span>`);
      b.type = 'button';
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', String(i === 0));
      b.tabIndex = i === 0 ? 0 : -1;
      b.setAttribute('aria-label', m.aria);
      b.dataset.mode = m.id;
      b.addEventListener('click', () => this.pick(m.id));
      this.switchBtns.set(m.id, b);
      this.switchEl.appendChild(b);
    });
    this.switchEl.style.setProperty('--i', '0');
    this.switchEl.addEventListener('keydown', (e) => this.onSwitchKey(e));
    const menuBtn = el('button', 'cbx-ib cbx-menu', ICON.menu);
    menuBtn.type = 'button';
    menuBtn.setAttribute('aria-label', 'Menu');
    menuBtn.setAttribute('aria-haspopup', 'dialog');
    menuBtn.addEventListener('click', () => this.openMenu());
    row1.appendChild(menuBtn);
    dock.appendChild(this.switchEl);

    this.hintEl = el('p', 'ml-hint');
    this.hintEl.setAttribute('role', 'status');
    this.hintEl.setAttribute('aria-live', 'polite');
    this.toastEl = el('div', 'cbx-toast');
    this.toastEl.setAttribute('aria-hidden', 'true');
    // a caption bubble (unused by Bobo, who doesn't talk; kept for the HudApi)
    this.bubble = el('div', 'cbx-bubble', `<b class="cbx-bubble-name" aria-hidden="true">Bobo</b><span class="cbx-bubble-text" aria-hidden="true"></span><span class="cbx-sr" role="status" aria-live="polite"></span>`);
    this.bubbleWords = this.bubble.querySelector('.cbx-bubble-text')!;
    this.bubbleSr = this.bubble.querySelector('.cbx-sr')!;
    this.above = el('div', 'cbx-above');
    const bottom = el('div', 'cbx-bottom');
    this.left = el('div', 'cbx-slot-left');
    this.centre = el('div', 'cbx-slot-centre');
    this.right = el('div', 'cbx-slot-right');
    bottom.append(this.left, this.centre, this.right);

    // joystick (bottom centre, walking modes)
    // a plain joystick: navy base, a white ring with one orange arc gliding round it (a flat shimmer, no gradient),
    // and an orange thumb
    this.stick = el('div', 'cbx-stick pe', `<svg class="cbx-stick-ring" viewBox="0 0 116 116" aria-hidden="true"><circle cx="58" cy="58" r="54" fill="none" stroke="currentColor" stroke-width="3" opacity="0.5"/><circle class="arc" cx="58" cy="58" r="54" fill="none" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="16 84"/></svg><span></span>`);
    this.stick.setAttribute('role', 'application');
    this.stick.setAttribute('aria-label', 'Joystick: walk Bobo');
    this.stick.hidden = true;
    this.stickKnob = this.stick.querySelector('span') as HTMLElement;
    this.bindStick();

    this.hudEl.append(top, this.hintEl, this.toastEl, this.bubble, this.above, bottom);
    this.layer = el('div', 'cbx-layer');

    // the mode-change cover: a flat iris in the target mode's colour grows from the tapped tab, the target mode's badge sits in the middle,
    // then the whole cover fades off the new view (reduced motion: a plain crossfade)
    this.coverEl = el('div', 'cbx-cover', `<i class="cbx-cover-disc"></i><div class="cbx-cover-sky" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div><div class="cbx-cover-in">${headHop('')}<strong class="cbx-cover-title"></strong><p><span class="cbx-cover-badge"></span><b></b><em class="cbx-dots"><i></i><i></i><i></i></em></p></div>`);
    this.coverEl.setAttribute('role', 'status');
    this.coverDisc = this.coverEl.querySelector('.cbx-cover-disc')!;
    this.coverIcon = this.coverEl.querySelector('.cbx-cover-badge')!;
    this.coverText = this.coverEl.querySelector('.cbx-cover-in b')!;
    this.coverTitle = this.coverEl.querySelector('.cbx-cover-title')!;
    this.flashEl = el('div', 'cbx-flash');

    container.append(this.layer, this.hudEl, this.splash, this.coverEl, this.flashEl);
  }

  // ------------------------------------------------------------------ splash
  progress(p: number): void {
    const v = Math.round(Math.min(1, Math.max(0, p)) * 100);
    (this.loadBar.firstElementChild as HTMLElement).style.width = v + '%';
    this.loadBar.setAttribute('aria-valuenow', String(v));
  }
  bearReady(): void {
    this.splash.classList.add('bear-ready');
  }
  ready(): void {
    this.progress(1);
    this.loadBar.classList.add('done');
    this.startBtn.disabled = false;
    this.startBtn.textContent = 'Start';
    this.startBtn.classList.add('ready');
  }
  starting(): void {
    this.startBtn.disabled = true;
    this.startBtn.textContent = 'Starting…';
  }
  /** The CSS-pixel rectangle of the splash's hero window (the showcase frames the bear inside it). */
  heroRect(): DOMRect | null {
    const h = this.splash.querySelector('.sp-hero');
    return h && !this.splash.hidden ? h.getBoundingClientRect() : null;
  }
  hideSplash(): void {
    this.splash.classList.add('gone');
    this.petals.burst();
    this.irisFrom = null;
    this.hudEl.hidden = false;
    this.hudEl.classList.add('off');
    requestAnimationFrame(() => this.hudEl.classList.remove('off'));
    window.setTimeout(() => { if (this.splash.classList.contains('gone')) { this.splash.hidden = true; this.petals.stop(); } }, 1200);
  }
  showSplashAgain(): void {
    this.splash.hidden = false;
    this.splash.classList.remove('gone');
    this.petals.start();
    this.hudEl.hidden = true;
    this.startBtn.disabled = false;
    this.startBtn.textContent = 'Start';
  }

  // ------------------------------------------------------------------ mode switcher
  setMode(mode: ExperienceMode, busy: boolean): void {
    const prev = this.curMode;
    if (prev !== mode) this.closeAllSheets(); // a sheet from the last mode (Games, Moves) never follows you
    this.curMode = mode;
    this.root.dataset.mode = mode;
    this.busy = busy;
    const i = MODES.findIndex((m) => m.id === mode);
    const focused = this.switchEl.contains(document.activeElement);
    for (const [id, b] of this.switchBtns) {
      const on = id === mode;
      b.setAttribute('aria-selected', String(on));
      // aria-disabled (not disabled) while a camera starts, so keyboard focus stays where it is
      if (busy && !on) b.setAttribute('aria-disabled', 'true'); else b.removeAttribute('aria-disabled');
      if (!focused) b.tabIndex = on ? 0 : -1;
      b.classList.toggle('queued', busy && id === this.pending);
    }
    if (i >= 0 && this.switchEl.style.getPropertyValue('--i') !== String(i)) {
      this.switchEl.style.setProperty('--i', String(i));
      if (prev !== mode) this.squish();
    }
    this.switchEl.classList.toggle('busy', busy);
    this.switchEl.setAttribute('aria-busy', String(busy));
    if (!busy && this.pending) {
      const next = this.pending;
      this.pending = null;
      this.switchBtns.get(next)?.classList.remove('queued');
      if (next !== mode && !this.sheetOpen) window.setTimeout(() => this.pick(next), 0);
    }
  }

  private squish(): void {
    const p = this.switchPill.firstElementChild as HTMLElement;
    p.classList.remove('moving');
    void p.offsetWidth; // restart the keyframes
    p.classList.add('moving');
  }

  /** A tab was tapped (or Enter / Space). */
  private pick(id: ExperienceMode): void {
    if (this.busy) {
      // a camera is starting: remember the last tap and do it when this switch ends
      this.pending = id === this.curMode ? null : id;
      for (const [m, b] of this.switchBtns) b.classList.toggle('queued', m === this.pending);
      return;
    }
    if (id === this.curMode) return;
    try { navigator.vibrate?.(8); } catch { /* not allowed here */ }
    const b = this.switchBtns.get(id);
    if (b) {
      const r = b.getBoundingClientRect(), box = this.root.getBoundingClientRect();
      this.irisFrom = { x: r.left + r.width / 2 - box.left, y: r.top + r.height / 2 - box.top };
    }
    this.opts.onSwitch(id);
  }

  private onSwitchKey(e: KeyboardEvent): void {
    const btns = [...this.switchBtns.values()];
    const i = btns.indexOf(document.activeElement as HTMLButtonElement);
    if (i < 0) return;
    let n = -1;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') n = (i + 1) % btns.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') n = (i - 1 + btns.length) % btns.length;
    else if (e.key === 'Home') n = 0;
    else if (e.key === 'End') n = btns.length - 1;
    if (n < 0) return;
    e.preventDefault();
    btns.forEach((b, k) => { b.tabIndex = k === n ? 0 : -1; });
    btns[n].focus();
  }
  setReserved(px: number): void {
    this.root.style.setProperty('--cbx-reserved', Math.max(0, px) + 'px');
  }

  // ------------------------------------------------------------------ HudApi
  hint(text: string): void {
    text = text || '';
    if (text === this.hintText) return;
    const shown = this.hintEl.classList.contains('on');
    this.hintText = text;
    clearTimeout(this.hintT);
    const h = this.hintEl;
    if (!text) {
      // fade and sink away, then clear (the pill keeps its width while it fades)
      h.classList.remove('on', 'swap');
      this.hintT = window.setTimeout(() => { if (!this.hintText) h.textContent = ''; }, 320);
    } else if (!shown) {
      h.classList.remove('swap');
      h.textContent = text;
      void h.offsetWidth;
      h.classList.add('on'); // rise and fade in
    } else {
      // new words while showing: a quick lift-out, then the new text rises in
      h.classList.add('swap');
      this.hintT = window.setTimeout(() => { h.textContent = this.hintText; h.classList.remove('swap'); }, 170);
    }
  }
  toast(text: string, ms = 1500): void {
    this.toastEl.textContent = text;
    this.toastEl.classList.remove('on');
    void this.toastEl.offsetWidth;
    this.toastEl.classList.add('on');
    clearTimeout(this.toastT);
    this.toastT = window.setTimeout(() => this.toastEl.classList.remove('on'), ms);
  }
  /**
   * Caption words. Text that continues what is showing (a growing transcript) only reveals the new words; other
   * text replaces it, revealed word by word. Long speech keeps its latest words.
   */
  speech(text: string | null): void {
    clearTimeout(this.speechT);
    const t = (text ?? '').replace(/\s+/g, ' ').trim();
    if (!t) {
      this.bubble.classList.remove('on');
      this.bubbleSr.textContent = '';
      this.speechT = window.setTimeout(() => { this.bubbleWords.textContent = ''; this.speechWords = []; }, 300);
      return;
    }
    let words = t.split(' ');
    let clipped = false;
    if (words.length > 26) { words = words.slice(-24); clipped = true; }
    const prev = this.bubble.classList.contains('on') ? this.speechWords : [];
    let keep = 0;
    while (keep < prev.length && keep < words.length && prev[keep] === words[keep]) keep++;
    // a partial word that grew ("Hel" -> "Hello") is replaced, not re-revealed from the start
    if (clipped || keep === 0 || keep < prev.length - 1) keep = 0;
    const spans = this.bubbleWords.children;
    while (spans.length > keep) spans[spans.length - 1].remove();
    const fresh = words.slice(keep);
    const step = Math.min(70, 1100 / Math.max(1, fresh.length));
    fresh.forEach((w, k) => {
      const s = document.createElement('span');
      s.textContent = (keep + k === 0 && clipped ? '…' : '') + w + ' ';
      s.style.animationDelay = `${Math.round(k * step)}ms`;
      this.bubbleWords.appendChild(s);
    });
    this.speechWords = words;
    this.bubbleSr.textContent = t;
    this.bubble.classList.add('on');
  }
  toolButton(o: { label: string; icon: string; aria?: string; onClick: () => void; tone?: 'orange' | 'navy' }): HTMLButtonElement {
    const b = el('button', 'cbx-tool' + (o.tone ? ' ' + o.tone : ''), `${o.icon}<span>${esc(o.label)}</span>`);
    b.type = 'button';
    b.setAttribute('aria-label', o.aria ?? o.label);
    b.addEventListener('click', (e) => { e.stopPropagation(); o.onClick(); });
    return b;
  }
  pill(label: string, onClick: () => void, light = false): HTMLButtonElement {
    const b = el('button', 'cbx-pill' + (light ? ' light' : ''), esc(label));
    b.type = 'button';
    b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
    return b;
  }
  /**
   * The round shutter. With `hold`: tap = photo, press and hold = video (Dapo, round 5). Holding past 0.28 s calls
   * hold.start() (false = can't record here: nothing happens); letting go calls hold.stop(). A red ring fills over
   * the 30 s limit while it records. Keyboard Enter / Space is always a photo.
   */
  shutter(onClick: () => void, aria = 'Take a photo', hold?: ShutterHold): HTMLButtonElement {
    const b = el('button', 'cbx-shutter', '<svg class="cbx-rec-ring" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="46" pathLength="100"/></svg><i></i>');
    b.type = 'button';
    b.setAttribute('aria-label', hold ? `${aria}. Hold to record a video` : aria);
    if (!hold) {
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
      return b;
    }
    b.classList.add('can-rec');
    let timer = 0, pid: number | null = null, recording = false, raf = 0;
    const ring = b.querySelector('circle') as SVGCircleElement;
    const loop = () => {
      if (!recording) return;
      if (!recorder.recording) { endRec(false); return; } // stopped by itself (30 s limit)
      ring.style.strokeDashoffset = String(100 - Math.min(100, (recorder.seconds / CLIP_MAX_S) * 100));
      raf = requestAnimationFrame(loop);
    };
    const endRec = (callStop: boolean) => {
      cancelAnimationFrame(raf);
      if (!recording) return;
      recording = false;
      b.classList.remove('rec', 'rec-wait');
      ring.style.strokeDashoffset = '100';
      if (callStop) hold.stop();
    };
    b.addEventListener('pointerdown', (e) => {
      if (pid !== null || b.disabled) return;
      e.stopPropagation();
      pid = e.pointerId;
      try { b.setPointerCapture(e.pointerId); } catch { /* fine */ }
      b.classList.add('down');
      timer = window.setTimeout(() => {
        timer = 0;
        if (pid === null || !hold.start()) return;
        recording = true;
        b.classList.add('rec', 'rec-wait');
        window.setTimeout(() => b.classList.remove('rec-wait'), 600); // the first frames may take a moment
        loop();
      }, 280);
    });
    const up = (e: PointerEvent, cancel: boolean) => {
      if (e.pointerId !== pid) return;
      e.stopPropagation();
      pid = null;
      b.classList.remove('down');
      if (recording) { endRec(true); return; }
      if (timer) { clearTimeout(timer); timer = 0; if (!cancel) onClick(); }
    };
    b.addEventListener('pointerup', (e) => up(e, false));
    b.addEventListener('pointercancel', (e) => up(e, true));
    b.addEventListener('contextmenu', (e) => e.preventDefault());
    // keyboard / assistive tech: a click with no pointer press is a photo
    b.addEventListener('click', (e) => { e.stopPropagation(); if (e.detail === 0) onClick(); });
    (b as HTMLButtonElement & { endRec?: () => void }).endRec = () => endRec(false);
    return b;
  }
  flash(): void {
    this.flashEl.style.opacity = '0.85';
    window.setTimeout(() => { this.flashEl.style.opacity = '0'; }, 90);
  }
  joystick(show: boolean): { readonly vector: THREE.Vector2; readonly active: boolean } {
    if (show && this.stick.parentElement !== this.centre) this.centre.appendChild(this.stick);
    this.stick.hidden = !show;
    if (!show) this.releaseStick();
    return this.stickState;
  }
  get stickVector(): THREE.Vector2 {
    return this.stickState.vector;
  }

  private stickId: number | null = null;
  private bindStick(): void {
    const s = this.stick;
    const move = (e: PointerEvent) => {
      const r = s.getBoundingClientRect();
      const v = this.stickState.vector.set((e.clientX - (r.left + r.width / 2)) / (r.width / 2), (e.clientY - (r.top + r.height / 2)) / (r.height / 2));
      if (v.length() > 1) v.normalize();
      this.stickKnob.style.transform = `translate(${v.x * 34}px,${v.y * 34}px)`;
    };
    s.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      this.stickId = e.pointerId;
      try { s.setPointerCapture(e.pointerId); } catch { /* synthetic */ }
      this.stickState.active = true;
      s.classList.add('on');
      move(e);
    });
    s.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) move(e); });
    const end = (e: PointerEvent) => { if (e.pointerId === this.stickId) this.releaseStick(); };
    s.addEventListener('pointerup', end);
    s.addEventListener('pointercancel', end);
    s.addEventListener('lostpointercapture', end);
  }
  private releaseStick(): void {
    this.stickId = null;
    this.stickState.active = false;
    this.stickState.vector.set(0, 0);
    this.stickKnob.style.transform = '';
    this.stick.classList.remove('on');
  }

  // ------------------------------------------------------------------ cover
  /**
   * The flat cover while the camera switches. With text: a pink iris grows from the tapped tab (or the top centre)
   * and the target mode's badge appears; null: the cover fades off the new view. Resolves once fully covered, so a
   * caller may await it before tearing the old view down (optional).
   */
  cover(text: string | null): Promise<void> {
    clearTimeout(this.coverOutT);
    const c = this.coverEl;
    if (text) {
      this.coverText.textContent = text;
      const m = MODES.find((x) => x.id === this.curMode);
      this.coverIcon.innerHTML = m ? m.icon : ICON.heart;
      // each mode has its own flat EVADE colour (slate, blue, pink, violet) and says where it is going
      this.coverTitle.textContent = `Switching to ${m ? m.label : '3D'} mode`;
      c.dataset.to = m ? m.id : 'showcase';
      if (c.classList.contains('on')) return Promise.resolve();
      const box = this.root.getBoundingClientRect();
      const o = this.irisFrom ?? { x: box.width / 2, y: Math.min(60, box.height / 2) };
      const R = Math.ceil(Math.hypot(Math.max(o.x, box.width - o.x), Math.max(o.y, box.height - o.y))) + 2;
      Object.assign(this.coverDisc.style, { width: `${2 * R}px`, height: `${2 * R}px`, left: `${o.x - R}px`, top: `${o.y - R}px` });
      const wasOut = c.classList.contains('out');
      c.classList.remove('out');
      if (!wasOut) void c.offsetWidth; // start the iris from nothing
      c.classList.add('on');
      this.coverOnAt = performance.now();
      this.hudEl.classList.add('covering'); // the top bar stays above the cover; the rest of the HUD fades
      this.irisFrom = null;
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      // (never cancelled: a caller awaiting this must always go on)
      return new Promise((r) => { window.setTimeout(r, wasOut ? 0 : reduced ? 180 : 340); });
    }
    if (!c.classList.contains('on')) return Promise.resolve();
    // a fast swap still gets the whole wipe: the iris finishes covering before the cover fades off the new view
    const minOn = matchMedia('(prefers-reduced-motion: reduce)').matches ? 220 : 460;
    const out = () => {
      c.classList.remove('on');
      c.classList.add('out');
      this.hudEl.classList.remove('covering');
      this.coverOutT = window.setTimeout(() => c.classList.remove('out'), 420);
    };
    const wait = minOn - (performance.now() - this.coverOnAt);
    if (wait > 0) this.coverOutT = window.setTimeout(out, wait); else out();
    return Promise.resolve();
  }

  // ------------------------------------------------------------------ sheets
  sheet(o: { title: string; body: string; buttons: string[]; html?: string; qr?: string }): Promise<number> {
    return new Promise((resolve) => {
      const wrap = el('div', 'cbx-sheet-wrap');
      wrap.setAttribute('role', 'dialog');
      wrap.setAttribute('aria-modal', 'true');
      const sh = el('div', 'cbx-sheet');
      sh.innerHTML = `<h2>${esc(o.title)}</h2>${o.body ? `<p>${esc(o.body)}</p>` : ''}${o.html ?? ''}`;
      if (o.qr) {
        const q = el('div', 'qr', qrSvg(o.qr));
        q.setAttribute('role', 'img');
        q.setAttribute('aria-label', 'QR code that opens this page on your phone');
        sh.appendChild(q);
      }
      const row = el('div', 'row');
      o.buttons.forEach((label, i) => {
        const b = el('button', 'btn' + (i > 0 ? ' alt' : ''), esc(label));
        b.type = 'button';
        b.addEventListener('click', () => { this.closeSheet(wrap); resolve(i); });
        row.appendChild(b);
      });
      sh.appendChild(row);
      wrap.appendChild(sh);
      wrap.addEventListener('click', (e) => { if (e.target === wrap) { this.closeSheet(wrap); resolve(-1); } });
      this.root.appendChild(wrap);
      this.openSheets.push(wrap);
      (row.firstElementChild as HTMLElement | null)?.focus();
    });
  }
  private closeSheet(w: HTMLElement): void {
    w.remove();
    this.openSheets = this.openSheets.filter((x) => x !== w);
  }
  closeAllSheets(): void {
    for (const w of this.openSheets) w.remove();
    this.openSheets = [];
  }
  get sheetOpen(): boolean {
    return this.openSheets.length > 0;
  }

  openOnPhone(what: string): Promise<number> {
    const url = location.href.replace(/[?&](test|desktop|diag|verbose)\b[^&]*/g, '').replace(/[?&]$/, '');
    return this.sheet({
      title: 'Open this on your phone',
      body: `${what} uses your phone's camera. Scan this to open it there. The 3D view works right here.`,
      buttons: ['Close'],
      qr: url,
    });
  }

  private openMenu(): void {
    const wrap = el('div', 'cbx-sheet-wrap');
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.setAttribute('aria-label', 'Menu');
    wrap.innerHTML = `<div class="cbx-sheet is-menu">
      <img class="sh-logo" src="${BRAND.logo}" alt="EVADE" width="600" height="150">
      <h2>${titleHtml(this.title, esc)}</h2>
      <button type="button" class="mi" data-a="arcade"><span class="mi-ic">${ARCADE_SVG}</span><span class="mi-t">Bobo's Arcade<small>Every EVADE game and experience</small></span><span class="mi-go" aria-hidden="true">›</span></button>
      <button type="button" class="mi" data-a="how"><span class="mi-ic">${ICON.info}</span><span class="mi-t">How it works<small>3D, AR, Selfie and Photo</small></span><span class="mi-go" aria-hidden="true">›</span></button>
      <a class="mi" href="${BRAND.labs}" data-a="labs"><span class="mi-ic">${ICON.grid}</span><span class="mi-t">EVADE Labs<small>All the EVADE experiences on one page</small></span><span class="mi-go" aria-hidden="true">›</span></a>
      <button type="button" class="mi" data-a="restart"><span class="mi-ic">${ICON.restart}</span><span class="mi-t">Start again<small>Back to the start screen</small></span><span class="mi-go" aria-hidden="true">›</span></button>
      <div class="row"><button type="button" class="btn" data-a="close">Back</button></div>
      <a class="small-link" href="${BRAND.licences}" target="_blank" rel="noopener" data-a="lic">Licences</a>
    </div>`;
    wrap.addEventListener('click', (e) => {
      const a = (e.target as HTMLElement).closest<HTMLElement>('[data-a]')?.dataset.a;
      if (a === 'labs' || a === 'lic') { this.closeSheet(wrap); return; } // plain links
      if (e.target === wrap || a) this.closeSheet(wrap);
      if (a === 'how') this.openHow();
      if (a === 'restart') this.opts.onRestart();
      if (a === 'arcade') window.dispatchEvent(new CustomEvent(OPEN_ARCADE_EVENT));
    });
    this.root.appendChild(wrap);
    this.openSheets.push(wrap);
    (wrap.querySelector('.mi') as HTMLElement).focus();
  }

  openHow(): void {
    void this.sheet({
      title: 'How it works',
      body: '',
      html: `<ol>
        <li><b>3D</b>: Bobo's Hideout. Drag to look around, pinch to zoom and walk Bobo with the joystick. Tap an arcade machine, or <b>Arcade</b>, to pick a game.</li>
        <li><b>AR</b>: point your phone at the floor and tap <b>Place</b>. Bobo and his hideout appear in your room. <b>Move</b> puts them somewhere else.</li>
        <li><b>Selfie</b>: try on Bobo's cat hat, shades and can earrings, pick a frame and a filter, then tap the white button. Hold it for a video.</li>
        <li><b>Photo</b>: place a life-size Bobo cutout in the room. A friend puts their face in the hole and you snap them as Bobo.</li>
      </ol>`,
      buttons: ['Got it'],
    });
  }

  openLicences(): void {
    window.open(BRAND.licences, '_blank', 'noopener');
  }

  dispose(): void {
    this.closeAllSheets();
    this.petals.dispose();
    for (const n of [this.splash, this.hudEl, this.layer, this.coverEl, this.flashEl]) n.remove();
  }
}

function qrSvg(text: string): string {
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  } catch {
    return '';
  }
}
