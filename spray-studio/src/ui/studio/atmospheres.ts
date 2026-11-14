/**
 * Studio atmospheres — the backdrop behind the stage, and the accent the
 * studio's own furniture takes from it.
 *
 * Every atmosphere is one flat colour from the EVADE / MEDIALIFE palette.
 * Pattern presets add a sparse flat pattern (splats, moons, dots, sparkles,
 * zigzags) that drifts very slowly; solid presets are just the colour, for
 * when the piece should be the only thing on screen. No gradients anywhere.
 * Everything reaches CSS as custom properties on the studio root, so a change
 * of atmosphere is one style attribute, not a re-render of the rails.
 */

export interface AccentTrio {
  /** The studio's primary accent (dials, selected rows, tiles, the CTA). */
  accent: string;
  /** Secondary accent (the Paint mode, the first tool tile). */
  deep: string;
  /** Tertiary accent (stamp mode, the brush tile). */
  hot: string;
  /** Type colour on a solid accent fill. */
  onAccent: string;
}

export type PatternKind = 'splats' | 'moons' | 'dots' | 'sparkles' | 'zigzag';

export interface PatternAtmosphere extends AccentTrio {
  kind: 'pattern';
  id: string;
  name: string;
  /** One word for a swatch label; `name` is for the trigger and the header. */
  short: string;
  /** The flat backdrop colour. */
  color: string;
  pattern: PatternKind;
  /** Flat colour the pattern is drawn in (kept faint by `patternOpacity`). */
  patternColor: string;
  patternOpacity: number;
}

export interface SolidAtmosphere extends AccentTrio {
  kind: 'solid';
  id: string;
  name: string;
  color: string;
}

export type Atmosphere = PatternAtmosphere | SolidAtmosphere;

const YELLOW = '#f6c344';
const INK = '#15131a';
const BLUE = '#3f9be6';
const SKY = '#8cc8f8';
const MAGENTA = '#e85bd8';
const RED = '#ff3b4e';
const ORANGE = '#ff8a2a';
const GREEN = '#3ddc84';
const PURPLE = '#7a5cff';

/** The house accent: EVADE yellow with ink type, Bobo blue and magenta behind it. */
const EVADE: AccentTrio = { accent: YELLOW, deep: BLUE, hot: MAGENTA, onAccent: INK };

export const PATTERN_ATMOSPHERES: PatternAtmosphere[] = [
  {
    kind: 'pattern',
    id: 'evade',
    name: 'EVADE Slate',
    short: 'Slate',
    color: '#0f1519',
    pattern: 'splats',
    patternColor: YELLOW,
    patternOpacity: 0.07,
    ...EVADE,
  },
  {
    kind: 'pattern',
    id: 'bobo',
    name: 'Bobo Night',
    short: 'Night',
    color: '#0c1d2e',
    pattern: 'moons',
    patternColor: SKY,
    patternOpacity: 0.09,
    accent: SKY,
    deep: BLUE,
    hot: YELLOW,
    onAccent: INK,
  },
  {
    kind: 'pattern',
    id: 'ink',
    name: 'Ink Club',
    short: 'Ink',
    color: INK,
    pattern: 'sparkles',
    patternColor: MAGENTA,
    patternOpacity: 0.09,
    accent: MAGENTA,
    deep: SKY,
    hot: YELLOW,
    onAccent: INK,
  },
  {
    kind: 'pattern',
    id: 'purple',
    name: 'Purple Haze',
    short: 'Purple',
    color: '#191232',
    pattern: 'dots',
    patternColor: PURPLE,
    patternOpacity: 0.16,
    accent: YELLOW,
    deep: PURPLE,
    hot: MAGENTA,
    onAccent: INK,
  },
  {
    kind: 'pattern',
    id: 'court',
    name: 'Green Court',
    short: 'Court',
    color: '#0d1f17',
    pattern: 'zigzag',
    patternColor: GREEN,
    patternOpacity: 0.08,
    accent: GREEN,
    deep: SKY,
    hot: YELLOW,
    onAccent: INK,
  },
  {
    kind: 'pattern',
    id: 'heat',
    name: 'Heat Wave',
    short: 'Heat',
    color: '#24110f',
    pattern: 'splats',
    patternColor: ORANGE,
    patternOpacity: 0.08,
    accent: ORANGE,
    deep: RED,
    hot: YELLOW,
    onAccent: INK,
  },
];

export const SOLID_ATMOSPHERES: SolidAtmosphere[] = [
  { kind: 'solid', id: 'slate', name: 'Slate', color: '#0f1519', ...EVADE },
  { kind: 'solid', id: 'ink-solid', name: 'Ink', color: INK, ...EVADE },
  { kind: 'solid', id: 'black', name: 'Black', color: '#000000', ...EVADE },
  { kind: 'solid', id: 'navy', name: 'Navy', color: '#0c1d2e', accent: SKY, deep: BLUE, hot: YELLOW, onAccent: INK },
  { kind: 'solid', id: 'plum', name: 'Plum', color: '#1d1430', accent: MAGENTA, deep: PURPLE, hot: YELLOW, onAccent: INK },
  { kind: 'solid', id: 'concrete', name: 'Concrete', color: '#2b3137', ...EVADE },
];

export const CUSTOM_SOLID_ID = 'custom';

export const DEFAULT_ATMOSPHERE = PATTERN_ATMOSPHERES[0];

/** sRGB relative luminance of a `#rrggbb` colour. */
function luminance(hex: string): number {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return 0;
  const value = parseInt(match[1], 16);
  const [r, g, b] = [(value >> 16) & 255, (value >> 8) & 255, value & 255].map((raw) => {
    const c = raw / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * A solid of the user's own colour. On a dark colour the accent stays EVADE
 * yellow; on a light or yellowish one (where yellow would vanish) it turns to
 * ink with white type.
 */
export function customSolid(color: string): SolidAtmosphere {
  const light = luminance(color) > 0.3;
  return {
    kind: 'solid',
    id: CUSTOM_SOLID_ID,
    name: 'Custom',
    color,
    ...(light ? { accent: INK, deep: BLUE, hot: MAGENTA, onAccent: '#ffffff' } : EVADE),
  };
}

/* ------------------------------------------------------------------
   Patterns: tiny flat SVG tiles, hard-edged shapes only.
   ------------------------------------------------------------------ */

/** Edge length of a pattern tile in CSS pixels. */
export const PATTERN_TILE = 240;

const SPLAT =
  'M0-26c6 0 7 9 13 7s9-8 13-3-4 10-1 15 11 6 8 12-12 1-15 6-2 12-9 12-6-9-11-9-10 8-15 3 2-10-3-14-13-3-12-10 10-5 10-11-6-8-2-14 10 3 12-4z';

function shapes(kind: PatternKind): string {
  switch (kind) {
    case 'splats':
      return (
        `<path transform="translate(58 62) scale(1.1)" d="${SPLAT}"/>` +
        `<circle cx="96" cy="40" r="5"/><circle cx="104" cy="58" r="3"/><circle cx="28" cy="100" r="4"/>` +
        `<path transform="translate(176 178) rotate(70) scale(.7)" d="${SPLAT}"/>` +
        `<circle cx="206" cy="146" r="4"/><circle cx="150" cy="214" r="3"/><circle cx="196" cy="70" r="2.5"/>`
      );
    case 'moons':
      return (
        `<path transform="translate(60 64)" d="M0-18a18 18 0 1 0 14 29 14 14 0 1 1-14-29z"/>` +
        `<path transform="translate(182 172) rotate(-30) scale(.7)" d="M0-18a18 18 0 1 0 14 29 14 14 0 1 1-14-29z"/>` +
        `<circle cx="150" cy="54" r="3"/><circle cx="40" cy="182" r="3.5"/><circle cx="214" cy="104" r="2"/>`
      );
    case 'dots':
      return (
        `<circle cx="40" cy="40" r="7"/><circle cx="160" cy="70" r="4"/><circle cx="100" cy="150" r="9"/>` +
        `<circle cx="210" cy="190" r="5"/><circle cx="30" cy="210" r="3"/>`
      );
    case 'sparkles':
      return (
        `<path transform="translate(62 70)" d="M0-16 4-4 16 0 4 4 0 16-4 4-16 0-4-4z"/>` +
        `<path transform="translate(178 170) scale(.7)" d="M0-16 4-4 16 0 4 4 0 16-4 4-16 0-4-4z"/>` +
        `<circle cx="170" cy="50" r="3"/><circle cx="48" cy="186" r="2.5"/>`
      );
    case 'zigzag':
      return (
        `<path d="M30 60l14-12 14 12 14-12 14 12" fill="none" stroke-width="6" stroke-linejoin="miter"/>` +
        `<path d="M140 180l14-12 14 12 14-12 14 12" fill="none" stroke-width="6" stroke-linejoin="miter"/>` +
        `<circle cx="180" cy="60" r="4"/><circle cx="60" cy="170" r="3"/>`
      );
  }
}

/** The pattern tile as a CSS `url(...)`, drawn in one flat colour. */
export function patternImage(atmo: PatternAtmosphere): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PATTERN_TILE}" height="${PATTERN_TILE}" viewBox="0 0 240 240">` +
    `<g fill="${atmo.patternColor}" stroke="${atmo.patternColor}" stroke-width="0" fill-opacity="${atmo.patternOpacity}" stroke-opacity="${atmo.patternOpacity}">` +
    shapes(atmo.pattern) +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

/** Inline preview of an atmosphere, for swatches and the picker's trigger. */
export function atmospherePreview(atmo: Atmosphere): string {
  if (atmo.kind === 'solid') return atmo.color;
  const bold = { ...atmo, patternOpacity: Math.min(1, atmo.patternOpacity * 5) };
  return `${patternImage(bold)} center / 96px 96px repeat, ${atmo.color}`;
}

/** The custom properties the studio root carries for an atmosphere. */
export function atmosphereVars(atmo: Atmosphere): Record<string, string> {
  return {
    '--studio-accent': atmo.accent,
    '--studio-accent-deep': atmo.deep,
    '--studio-accent-hot': atmo.hot,
    '--studio-on-accent': atmo.onAccent,
    '--studio-ink': atmo.color,
  };
}

const STORAGE_KEY = 'spray:studio:atmosphere';

export function loadAtmosphere(): Atmosphere {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_ATMOSPHERE;
    const saved = JSON.parse(raw) as { id?: string; color?: string };
    if (saved.id === CUSTOM_SOLID_ID && typeof saved.color === 'string' && /^#[0-9a-f]{6}$/i.test(saved.color)) {
      return customSolid(saved.color);
    }
    return (
      PATTERN_ATMOSPHERES.find((a) => a.id === saved.id) ??
      SOLID_ATMOSPHERES.find((a) => a.id === saved.id) ??
      DEFAULT_ATMOSPHERE
    );
  } catch {
    return DEFAULT_ATMOSPHERE;
  }
}

export function saveAtmosphere(atmo: Atmosphere): void {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(atmo.kind === 'solid' && atmo.id === CUSTOM_SOLID_ID ? { id: atmo.id, color: atmo.color } : { id: atmo.id })
    );
  } catch {
    /* private mode */
  }
}
