// Dev page (experience-dev.html): mounts the experience without React and exposes `window.__cb` for the simulator
// and for poking at it by hand. A small test panel (hidden with ?clean) has a button for every action and mode.
import type { ExperienceEvents, ExperienceMode } from '../shared/contracts';
import { createExperience } from './index';
import { qs } from './core/device';

type Exp = ReturnType<typeof createExperience> & { debug(): Record<string, unknown>; internals: Record<string, unknown> };

const exp = createExperience({ initialMode: (qs.get('mode') as ExperienceMode) || undefined }) as Exp;
const events: Array<{ t: number; event: string; payload: unknown }> = [];
const names: Array<keyof ExperienceEvents> = ['progress', 'started', 'mode', 'userGesture', 'action', 'photo', 'unavailable'];
for (const n of names) {
  exp.on(n, (payload) => {
    if (n === 'progress') return;
    events.push({ t: Math.round(performance.now()), event: n, payload: n === 'photo' ? { size: (payload as { blob: Blob }).blob.size } : payload });
  });
}

const cb = {
  exp,
  events,
  trigger: (name: string) => exp.trigger(name),
  setMode: (m: ExperienceMode) => exp.setMode(m),
  debug: () => exp.debug(),
  internals: () => exp.internals,
  get mode() { return exp.mode; },
  get started() { return exp.started; },
  actions: exp.actions,
};
(window as unknown as { __cb: typeof cb }).__cb = cb;

const app = document.getElementById('app')!;
exp.mount(app).catch((e) => console.error('[dev] mount failed', e));

if (!qs.has('clean')) {
  const panel = document.createElement('details');
  panel.style.cssText = 'position:fixed;left:8px;top:96px;z-index:1000;font:12px/1.2 system-ui;background:rgba(0,0,0,.6);color:#fff;border-radius:10px;padding:6px 8px;max-width:180px';
  panel.innerHTML = '<summary style="cursor:pointer">test</summary>';
  const row = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'margin:2px;font:inherit;padding:4px 6px;border-radius:6px;border:0;background:#fff;color:#000';
    b.addEventListener('click', fn);
    panel.appendChild(b);
  };
  for (const a of exp.actions) row(a, () => exp.trigger(a));
  for (const m of ['showcase', 'ar', 'face', 'photo'] as ExperienceMode[]) row(m, () => void exp.setMode(m));
  row('debug', () => console.info(exp.debug()));
  document.body.appendChild(panel);
}
