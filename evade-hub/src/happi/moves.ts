// Happi's moves: the Moves button (3D and AR) opens a sheet of everything he can do. Each tile triggers a moment
// by name (src/experience/scene/moments.ts). Flat icons, brand colours.
import { BLOSSOM_SVG } from './blossom';

const I = (d: string, fill = false) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const MOVES: Array<{ name: string; label: string; icon: string; tone: string }> = [
  { name: 'Wave', label: 'Wave', icon: I('M7 11V6.5a1.5 1.5 0 0 1 3 0V11M10 10V4.5a1.5 1.5 0 0 1 3 0V10M13 10V5.5a1.5 1.5 0 0 1 3 0V12M16 9.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-12.6 4.2L4 15a1.6 1.6 0 0 1 2.4-2l.6.7'), tone: 'navy' },
  { name: 'Dance', label: 'Dance', icon: I('M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'), tone: 'orange' },
  { name: 'Cheer', label: 'Cheer', icon: I('M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z'), tone: 'red' },
  { name: 'House', label: 'Home', icon: I('M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z'), tone: 'navy' },
  { name: 'Party', label: 'Festival', icon: I('M5.8 11.3 2 22l10.7-3.8M11 13c1.9 1.9 2.8 4.2 2 5s-3.1-.1-5-2-2.8-4.2-2-5 3.1.1 5 2ZM15 2v2M22 9h-2M19 5l-1.5 1.5M20 14l-1.5-1'), tone: 'orange' },
  { name: 'Running', label: 'Run', icon: I('M4 16v-2.4C4 11.5 3 10.5 3 8c0-2.7 1.5-6 4.5-6C9.4 2 10 3.8 10 5.5c0 3.1-2 5.7-2 8.7V16a2 2 0 1 1-4 0ZM20 20v-2.4c0-2.1 1-3.1 1-5.6 0-2.7-1.5-6-4.5-6C14.6 6 14 7.8 14 9.5c0 3.1 2 5.7 2 8.7V20a2 2 0 1 0 4 0Z'), tone: 'sky' },
  { name: 'Stare', label: 'Happi Burst', icon: BLOSSOM_SVG, tone: 'red' },
  { name: 'Sparkle', label: 'Sparkle', icon: I('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'), tone: 'gold' },
  { name: 'Magic', label: 'Magic', icon: I('M3 21l11-11M15 4V2M15 16v-2M8 9H6M22 9h-2M17.8 11.8 19 13M17.8 6.2 19 5M12.2 6.2 11 5'), tone: 'navy' },
  { name: 'Cold', label: 'Brr!', icon: I('M12 2v20M3.3 7l17.4 10M20.7 7 3.3 17M9 4l3 2 3-2M9 20l3-2 3 2'), tone: 'sky' },
  { name: 'Sleep', label: 'Nap', icon: I('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'), tone: 'navy' },
];

export const MOVES_ICON = I('M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z', true);

export function movesHtml(): string {
  return `<div class="hm-grid">${MOVES.map((m) => `<button type="button" data-move="${m.name}" class="t-${m.tone}"><span>${m.icon}</span><b>${m.label}</b></button>`).join('')}</div>`;
}
