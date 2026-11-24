// Small DOM helpers and flat line icons for the capture UI (review sheet, players, countdown).
import './capture.css';

export const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

export const esc = (s: string): string => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

const svg = (d: string, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const CICON = {
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  save: svg('<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 19h14"/>'),
  share: svg('<path d="M12 15V4M8 8l4-4 4 4"/><path d="M6 12v7h12v-7"/>'),
  retake: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  play: svg('<path d="M8 5l11 7-11 7z"/>'),
  replay: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  clapper: svg('<path d="M4 10h16v9H4z"/><path d="M4 10l1.5-5 15 2.5-1 2.5"/><path d="M9 5.6l1.5 3.4M14 6.4l1.5 3.4"/>'),
  skip: svg('<path d="M6 6l8 6-8 6z"/><path d="M17 6v12"/>'),
};

/** A round-cornered action button with an icon and a label. */
export function actionButton(label: string, icon: string, onClick: () => void, kind: 'main' | 'alt' | 'ghost' | 'navy' = 'main'): HTMLButtonElement {
  const b = el('button', `cbc-btn ${kind}`, `${icon}<span>${esc(label)}</span>`);
  b.type = 'button';
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** A round icon-only button (close etc.). */
export function iconButton(icon: string, aria: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', `cbc-ib ${cls}`.trim(), icon);
  b.type = 'button';
  b.setAttribute('aria-label', aria);
  b.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return b;
}

/** A small flat segmented control (look / pose pickers). Calls `onPick` with the option id. */
export function segmented(
  label: string,
  options: Array<{ id: string; label: string }>,
  value: string,
  onPick: (id: string) => void,
): { el: HTMLElement; set(id: string): void } {
  const wrap = el('div', 'cbc-seg');
  wrap.setAttribute('role', 'radiogroup');
  wrap.setAttribute('aria-label', label);
  const btns = new Map<string, HTMLButtonElement>();
  const set = (id: string) => {
    for (const [k, b] of btns) b.setAttribute('aria-checked', String(k === id));
  };
  for (const o of options) {
    const b = el('button', '', esc(o.label));
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.id = o.id;
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      set(o.id);
      onPick(o.id);
    });
    btns.set(o.id, b);
    wrap.appendChild(b);
  }
  set(value);
  return { el: wrap, set };
}

/** Wait for an image to load (resolves null on error). */
export function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
