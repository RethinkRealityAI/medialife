// Flat line icons (white stroke), inline SVG strings.
const svg = (d: string, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;

export const ICON = {
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  move: svg('<path d="M12 3v18M3 12h18M12 3l-3 3M12 3l3 3M12 21l-3-3M12 21l3-3M3 12l3-3M3 12l3 3M21 12l-3-3M21 12l-3 3"/>'),
  leave: svg('<path d="M10 4H5v16h5"/><path d="M14 8l4 4-4 4M18 12H9"/>'),
  cube: svg('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>'),
  ar: svg('<path d="M4 8V5h3M17 5h3v3M20 16v3h-3M7 19H4v-3"/><path d="M12 7l4 2.5v5L12 17l-4-2.5v-5z"/>'),
  selfie: svg('<circle cx="12" cy="10" r="4"/><path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5"/>'),
  photo: svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  grid: svg('<rect x="4" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5"/>'),
  restart: svg('<path d="M4 12a8 8 0 1 0 2.4-5.7"/><path d="M4 4v4h4"/>'),
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 2.5l2.6 6.2 6.7.5-5.1 4.4 1.6 6.5L12 16.6l-5.8 3.5 1.6-6.5-5.1-4.4 6.7-.5z"/></svg>',
};
