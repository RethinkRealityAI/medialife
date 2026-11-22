// EVADE brand constants for the hub shell (splash, top bar, menu, sheets, frames, watermark). Flat colours only.
// Art is EVADE's own (logo, Bobo renders made from catbobo.glb with three.js) or drawn in code. No generative tools.

export const BRAND = {
  /** the page title on the splash and in the menu */
  title: "Bobo's Hideout",
  /** the splash's one-line lead */
  lead: 'Hang out with Bobo, snap a selfie and play every EVADE game in his arcade.',
  /** EVADE wordmark (white on transparent, 1200x300-ish) */
  logo: '/brand/evade-logo.webp',
  /** white MEDIALIFE "Activated by" badge */
  activatedBy: '/activated-merch/media/ar/activated-by.webp',
  licences: '/evade/licences/',
  /** EVADE Labs: every EVADE experience on one page */
  labs: '/evade/labs/',
  /** Bobo cutout render (catbobo.glb "Sit"/"Excited" pose, three.js headless, see src/evade/capture/tools/render-bobo.cjs) */
  boboRender: '/evade/hub/img/bobo/bobo-sit.webp',
} as const;

export const EV = {
  yellow: '#f6c344', press: '#b98d1f', cyan: '#4fd6e8', slate: '#0f1519', deep: '#0a1c2a', card: '#182127',
  muted: '#b8c2cc', ink: '#15131a', white: '#ffffff',
  red: '#e3243a', pink: '#ff4f9a', blue: '#2a5bd7', violet: '#6a32e8', orange: '#ff7a1a', indigo: '#4b3fb8', green: '#078a61',
} as const;

/** Splits "Bobo's Hideout" into "Bobo's " + "Hideout" so the last word can be cyan, like other EVADE titles. */
export function titleHtml(title: string, esc: (s: string) => string): string {
  const i = title.trim().lastIndexOf(' ');
  if (i < 0) return esc(title);
  return `${esc(title.slice(0, i + 1))}<span>${esc(title.slice(i + 1))}</span>`;
}

/**
 * Bobo's head, flat (code-drawn): tabby ears, the light blue visor band, two eyes. Used as the loading glyph and
 * on the mode-change cover. currentColor is the outline.
 */
export const BOBO_HEAD_SVG = `<svg class="ev-bobo" viewBox="0 0 120 110" aria-hidden="true">
  <path d="M18 50 14 8l34 22M102 50l4-42-34 22" fill="#f3ab5e" stroke="#15131a" stroke-width="5" stroke-linejoin="round"/>
  <path d="M24 30 22 17l12 8M96 30l2-13-12 8" fill="#f4a3a8"/>
  <ellipse cx="60" cy="62" rx="48" ry="42" fill="#f3ab5e" stroke="#15131a" stroke-width="5"/>
  <path d="M44 24l6 12 10-10 10 10 6-12" fill="none" stroke="#d8762c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>
  <rect x="14" y="44" width="92" height="22" rx="10" fill="#8cc8f8" stroke="#15131a" stroke-width="5"/>
  <circle cx="44" cy="55" r="5" fill="#15131a"/><circle cx="76" cy="55" r="5" fill="#15131a"/>
  <ellipse cx="60" cy="80" rx="16" ry="11" fill="#fde3bd"/>
  <path d="M56 76h8l-4 5z" fill="#15131a"/>
</svg>`;

/** Arcade joystick icon (flat line, currentColor) for the Arcade button and sheet. */
export const ARCADE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 15h16l-1.5 5h-13z"/><path d="M12 15V9"/><circle cx="12" cy="6" r="3"/><path d="M16.5 17.5h.01M7.5 17.5h2"/></svg>';
