// A stand-in for `src/experience` while it is being built (or when it fails to load). It draws a simple flat-colour
// stage with the same screen furniture the real experience owns (splash, top bar with mode switcher and menu, hint
// pill, Move bottom left, joystick / shutter bottom centre, speech bubble), so the app layer can be designed and
// screenshot against the real layout. Every call is logged to the console and to `window.__cbMock.experienceLog`.
//
// URL flags: ?autostart (skip the splash), ?showCorner (outline the reserved corner).
import type { ActionName, ExperienceApi, ExperienceEvents, ExperienceMode } from '@/shared/contracts';
import { CORE_ACTIONS } from '@/shared/contracts';
import { Emitter, params } from './emitter';

const CSS = `
.mx-root{position:absolute;inset:0;overflow:hidden;font-family:var(--cb-font);color:var(--cb-ink);background:var(--cb-sky);user-select:none;-webkit-user-select:none}
.mx-floor{position:absolute;left:0;right:0;bottom:0;height:38%;background:var(--cb-pink-soft)}
.mx-bear{position:absolute;left:50%;bottom:30%;width:150px;height:190px;transform:translateX(-50%);transition:transform .4s var(--cb-ease)}
.mx-bear>i{position:absolute;display:block;border-radius:50%;background:var(--cb-pink)}
.mx-bear .b{left:15px;top:70px;width:120px;height:120px}
.mx-bear .h{left:25px;top:0;width:100px;height:90px}
.mx-bear .e1,.mx-bear .e2{top:-6px;width:34px;height:34px}
.mx-bear .e1{left:22px}.mx-bear .e2{right:22px}
.mx-bear .t{left:45px;top:105px;width:60px;height:60px;background:var(--cb-white)}
.mx-bear .m{left:62px;top:52px;width:26px;height:10px;border-radius:0 0 14px 14px;background:var(--cb-ink);transition:height .1s}
.mx-bear .y1,.mx-bear .y2{top:30px;width:12px;height:14px;background:var(--cb-ink)}
.mx-bear .y1{left:52px}.mx-bear .y2{right:52px}
.mx-bear.talk .m{height:18px}
.mx-bear.act{transform:translateX(-50%) translateY(-24px) rotate(-6deg)}
.mx-banner{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);opacity:0;transition:all .35s var(--cb-ease);font-weight:700;font-size:28px;color:var(--cb-white);background:var(--cb-ink);padding:10px 20px;border-radius:999px;white-space:nowrap}
.mx-banner.on{opacity:1;transform:translate(-50%,-50%) scale(1)}
.mx-rainbow{position:absolute;left:50%;top:14%;width:320px;height:160px;transform:translateX(-50%);opacity:0;transition:opacity .4s}
.mx-rainbow.on{opacity:1}
.mx-rainbow span{position:absolute;left:0;right:0;height:22px;border-radius:999px}
.mx-top{position:absolute;left:0;right:0;top:0;padding:calc(var(--cb-safe-top) + 10px) 12px 8px;display:flex;align-items:center;gap:8px}
.mx-word{font-weight:700;font-size:18px;color:var(--cb-pink-deep);flex:1}
.mx-modes{display:flex;gap:2px;background:var(--cb-glass);backdrop-filter:var(--cb-blur);-webkit-backdrop-filter:var(--cb-blur);border-radius:999px;padding:3px}
.mx-modes button,.mx-menu{font:inherit;font-size:13px;font-weight:600;border:0;border-radius:999px;padding:0 10px;height:36px;color:var(--cb-white);background:transparent;cursor:pointer}
.mx-modes button[aria-pressed=true]{background:var(--cb-white);color:var(--cb-ink)}
.mx-menu{width:44px;height:44px;padding:0;background:var(--cb-glass);font-size:20px}
.mx-hint{position:absolute;left:50%;top:22%;transform:translateX(-50%);background:rgba(8,8,10,.56);backdrop-filter:blur(18px) saturate(150%);-webkit-backdrop-filter:blur(18px) saturate(150%);border:1px solid rgba(255,255,255,.14);color:#fff;font-size:13px;font-weight:500;padding:8px 14px;border-radius:999px;white-space:nowrap}
.mx-bubble{position:absolute;left:50%;bottom:calc(30% + 205px);transform:translateX(-50%);max-width:min(80%,420px);background:var(--cb-white);color:var(--cb-ink);font-size:15px;padding:10px 14px;border-radius:18px;text-align:center;display:none}
.mx-bubble.on{display:block}
.mx-bottom{position:absolute;left:0;right:0;bottom:calc(var(--cb-safe-bottom) + 16px);height:72px}
.mx-move{position:absolute;left:16px;bottom:10px;height:52px;padding:0 16px;border:0;border-radius:999px;background:var(--cb-glass);color:#fff;font:inherit;font-weight:600}
.mx-joy{position:absolute;left:50%;bottom:0;width:88px;height:88px;margin-left:-44px;border-radius:50%;background:var(--cb-glass);border:2px solid var(--cb-glass-line)}
.mx-joy::after{content:'';position:absolute;left:26px;top:26px;width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,.8)}
.mx-shutter{position:absolute;left:50%;bottom:0;width:76px;height:76px;margin-left:-38px;border-radius:50%;background:#fff;border:6px solid var(--cb-glass-strong);box-sizing:border-box}
.mx-corner{position:absolute;right:0;bottom:0;outline:2px dashed var(--cb-red);pointer-events:none}
.mx-tag{position:absolute;left:8px;bottom:calc(var(--cb-safe-bottom) + 100px);font:600 10px/1 var(--cb-font);letter-spacing:.08em;color:var(--cb-ink-soft);opacity:.7}
.mx-splash{position:absolute;inset:0;z-index:100;background:var(--cb-pink);color:var(--cb-white);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center}
.mx-splash h1{margin:0;font-size:40px;line-height:1}
.mx-splash p{margin:0;font-size:17px;max-width:300px}
.mx-splash .hero{width:120px;height:120px;border-radius:50%;background:var(--cb-white);display:grid;place-items:center;color:var(--cb-pink-deep);font-size:48px;font-weight:700}
.mx-splash button{font:inherit;font-weight:700;font-size:18px;min-width:200px;height:56px;border:0;border-radius:999px;background:var(--cb-yellow);color:var(--cb-ink);cursor:pointer}
.mx-splash button:disabled{opacity:.7;cursor:default}
.mx-splash .bar{width:200px;height:6px;border-radius:999px;background:rgba(255,255,255,.35);overflow:hidden}
.mx-splash .bar i{display:block;height:100%;width:0;background:var(--cb-white);transition:width .2s}
.mx-splash small{position:absolute;bottom:calc(var(--cb-safe-bottom) + 18px);font-size:12px;opacity:.9}
`;

const MODES: { id: ExperienceMode; label: string }[] = [
  { id: 'showcase', label: '3D' },
  { id: 'ar', label: 'AR' },
  { id: 'face', label: 'Selfie' },
  { id: 'photo', label: 'Photo' },
];

export function createMockExperience(): ExperienceApi {
  const em = new Emitter<ExperienceEvents>();
  const log: Array<{ at: number; call: string; args: unknown[] }> = [];
  const w = window as unknown as { __cbMock?: Record<string, unknown> };
  w.__cbMock = { ...(w.__cbMock ?? {}), experienceLog: log };
  const record = (call: string, ...args: unknown[]) => {
    log.push({ at: Date.now(), call, args });
    console.info(`[mock experience] ${call}`, ...args);
  };

  let mode: ExperienceMode = 'showcase';
  let started = false;
  let corner = 88;
  const cooldown = new Map<string, number>();
  let root: HTMLElement | null = null;
  let style: HTMLStyleElement | null = null;
  const timers = new Set<number>();
  const later = (fn: () => void, ms: number) => {
    const id = window.setTimeout(() => { timers.delete(id); fn(); }, ms);
    timers.add(id);
  };
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => root?.querySelector(sel) as T | null;

  function renderBottom() {
    const b = $('.mx-bottom');
    if (!b) return;
    const centre = mode === 'face' || mode === 'photo' ? '<div class="mx-shutter" aria-label="Take photo"></div>'
      : mode === 'ar' ? '<div class="mx-joy" aria-label="Joystick"></div>' : '';
    const move = mode === 'ar' ? '<button class="mx-move" type="button">Move</button>' : '';
    b.innerHTML = move + centre;
    root!.querySelectorAll<HTMLButtonElement>('.mx-modes button').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === mode));
    });
    const hint = $('.mx-hint');
    if (hint) hint.textContent = mode === 'ar' ? 'Point at the floor' : mode === 'face' ? 'Smile with Bobo' : 'Tap Bobo to say hi';
  }

  function renderCorner() {
    const c = $('.mx-corner');
    if (c) { c.style.width = `${corner}px`; c.style.height = `${corner}px`; }
  }

  const api: ExperienceApi = {
    async mount(container) {
      record('mount');
      style = document.createElement('style');
      style.textContent = CSS;
      document.head.appendChild(style);
      root = document.createElement('div');
      root.className = 'mx-root';
      root.innerHTML = `
        <div class="mx-floor"></div>
        <div class="mx-rainbow" aria-hidden="true">${['1', '2', '3', '4', '5', '6']
          .map((n, i) => `<span style="top:${i * 22}px;background:var(--cb-rainbow-${n});left:${i * 14}px;right:${i * 14}px"></span>`).join('')}</div>
        <div class="mx-bear" aria-hidden="true"><i class="e1"></i><i class="e2"></i><i class="b"></i><i class="t"></i><i class="h"></i><i class="y1"></i><i class="y2"></i><i class="m"></i></div>
        <div class="mx-banner" aria-hidden="true"></div>
        <div class="mx-bubble" role="status"></div>
        <div class="mx-top">
          <div class="mx-word">Bobo</div>
          <div class="mx-modes" role="group" aria-label="View">${MODES.map((m) => `<button type="button" data-mode="${m.id}">${m.label}</button>`).join('')}</div>
          <button class="mx-menu" type="button" aria-label="Menu">&#8801;</button>
        </div>
        <div class="mx-hint" role="status"></div>
        <div class="mx-bottom"></div>
        ${params().has('showCorner') ? '<div class="mx-corner"></div>' : ''}
        <div class="mx-splash">
          <div class="hero">CB</div>
          <h1>Bobo</h1>
          <p>Bring Bobo into your room.</p>
          <button type="button" disabled>Loading…</button>
          <div class="bar"><i></i></div>
          <small>Activated by MEDIALIFE</small>
        </div>`;
      container.appendChild(root);
      renderBottom();
      renderCorner();
      root.querySelectorAll<HTMLButtonElement>('.mx-modes button').forEach((btn) => {
        btn.addEventListener('click', () => { void api.setMode(btn.dataset.mode as ExperienceMode); });
      });
      root.querySelector('.mx-bear')?.addEventListener('click', () => {
        if (api.trigger('Cheer')) em.emit('action', { name: 'Cheer', source: 'tap' });
      });

      // fake loading
      const bar = $('.mx-splash .bar i');
      const start = $<HTMLButtonElement>('.mx-splash button');
      let p = 0;
      await new Promise<void>((resolve) => {
        const step = () => {
          p = Math.min(1, p + 0.25);
          em.emit('progress', p);
          if (bar) bar.style.width = `${p * 100}%`;
          if (p < 1) later(step, 120); else resolve();
        };
        step();
      });
      if (start) {
        start.disabled = false;
        start.textContent = 'Start';
        start.addEventListener('click', () => {
          record('start tapped');
          em.emit('userGesture', undefined);
          $('.mx-splash')?.remove();
          started = true;
          em.emit('started', { mode });
        });
        if (params().has('autostart')) later(() => start.click(), 50);
      }
    },
    get mode() { return mode; },
    get started() { return started; },
    async setMode(next) {
      record('setMode', next);
      if (next === mode) return;
      em.emit('mode', { mode: next, busy: true });
      await new Promise((r) => later(() => r(null), 250));
      mode = next;
      renderBottom();
      em.emit('mode', { mode, busy: false });
    },
    trigger(action: ActionName) {
      const name = String(action);
      const known = [...CORE_ACTIONS].find((a) => a.toLowerCase() === name.toLowerCase());
      const now = Date.now();
      if (!known) { record('trigger (unknown)', name); return false; }
      if ((cooldown.get(known) ?? 0) > now) { record('trigger (cooldown)', known); return false; }
      cooldown.set(known, now + 1500);
      record('trigger', known);
      em.emit('action', { name: known, source: 'api' });
      const banner = $('.mx-banner');
      const bear = $('.mx-bear');
      if (banner) { banner.textContent = known; banner.classList.add('on'); }
      bear?.classList.add('act');
      if (known === 'Rainbow') $('.mx-rainbow')?.classList.add('on');
      later(() => { banner?.classList.remove('on'); bear?.classList.remove('act'); }, 1400);
      if (known === 'Rainbow') later(() => $('.mx-rainbow')?.classList.remove('on'), 3000);
      return true;
    },
    actions: [...CORE_ACTIONS],
    setSpeechStream(stream) {
      record('setSpeechStream', stream ? 'stream' : null);
      $('.mx-bear')?.classList.toggle('talk', !!stream);
    },
    setSpeechText(text) {
      record('setSpeechText', text);
      const b = $('.mx-bubble');
      if (!b) return;
      b.textContent = text ?? '';
      b.classList.toggle('on', !!text);
    },
    async say(url, caption) {
      record('say', url, caption);
      if (caption) api.setSpeechText(caption);
      await new Promise((r) => later(() => r(null), 1200));
      if (caption) api.setSpeechText(null);
    },
    setReservedCorner(px) {
      record('setReservedCorner', px);
      corner = px;
      renderCorner();
    },
    on: (event, cb) => em.on(event, cb),
    dispose() {
      record('dispose');
      timers.forEach((t) => clearTimeout(t));
      em.clear();
      root?.remove();
      style?.remove();
      root = null;
    },
  };
  return api;
}
