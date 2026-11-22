// Bobo's Actions: the Actions button (3D and AR) opens a sheet of everything he can do, named in plain words. Each
// tile triggers a moment by name (src/experience/scene/moments.ts); Sit, Chill, Purr, Alert, Run and Nap are his real
// clips. Flat icons, EVADE colours (the tones are classes the sheet styles).
const I = (d: string, fill = false) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}" fill="${fill ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const PAW = 'M12 13c-2.8 0-5 2.2-5 4.3 0 1.6 1.3 2.7 2.8 2.7 1 0 1.5-.5 2.2-.5s1.2.5 2.2.5c1.5 0 2.8-1.1 2.8-2.7 0-2.1-2.2-4.3-5-4.3ZM6 11.5a1.8 2.2 0 1 0 0-.1M18 11.5a1.8 2.2 0 1 0 0-.1M9.3 7.5a1.8 2.3 0 1 0 0-.1M14.7 7.5a1.8 2.3 0 1 0 0-.1';

export const MOVES: Array<{ name: string; label: string; icon: string; tone: string }> = [
  { name: 'Wave', label: 'Hello', icon: I(PAW), tone: 'gold' },
  { name: 'Sit', label: 'Sit', icon: I('M7 21v-6a5 5 0 0 1 10 0v6M5 21h14M9 9a3 3 0 1 1 6 0'), tone: 'navy' },
  { name: 'Chill', label: 'Chill', icon: I('M3 17h18M5 17v-4a3 3 0 0 1 3-3h8a3 3 0 0 1 3 3v4M7 21v-4M17 21v-4'), tone: 'sky' },
  { name: 'Purr', label: 'Purr', icon: I('M12 20.5 4.6 13.3A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 7.4 6Z'), tone: 'red' },
  { name: 'Alert', label: 'Alert', icon: I('M12 3v11M12 19v.5M5 4l2 3M19 4l-2 3'), tone: 'orange' },
  { name: 'Cheer', label: 'Excited', icon: I('M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17l-5.9 3.3 1.3-6.5-4.9-4.5 6.6-.8z'), tone: 'gold' },
  { name: 'Running', label: 'Run', icon: I('M13 4a2 2 0 1 0 4 0 2 2 0 0 0-4 0M5 21l4-6 3 2 2-5 4 3M9 11l3-3 3 1 2 3'), tone: 'sky' },
  { name: 'Dance', label: 'Dance', icon: I('M9 18V5l11-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM20 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'), tone: 'orange' },
  { name: 'Party', label: 'Party', icon: I('M5.8 11.3 2 22l10.7-3.8M11 13c1.9 1.9 2.8 4.2 2 5s-3.1-.1-5-2-2.8-4.2-2-5 3.1.1 5 2ZM15 2v2M22 9h-2M19 5l-1.5 1.5M20 14l-1.5-1'), tone: 'red' },
  { name: 'Sparkle', label: 'Sparkle', icon: I('M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z'), tone: 'gold' },
  { name: 'Magic', label: 'Fizz', icon: I('M8 21h8M9 3h6l-1 4v14h-4V7zM12 11v.01M12 15v.01'), tone: 'sky' },
  { name: 'Sleep', label: 'Nap', icon: I('M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'), tone: 'navy' },
];

export const MOVES_ICON = I(PAW, true);

/** A joystick (the Arcade button). */
export const ARCADE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="currentColor"><rect x="3" y="15" width="18" height="6" rx="2"/><rect x="11" y="7" width="2" height="9"/><circle cx="12" cy="6" r="3.2"/><circle cx="17.5" cy="13.6" r="1.4"/></g></svg>';

export function movesHtml(): string {
  return `<div class="hm-grid">${MOVES.map((m) => `<button type="button" data-move="${m.name}" class="t-${m.tone}"><span>${m.icon}</span><b>${m.label}</b></button>`).join('')}</div>`;
}
