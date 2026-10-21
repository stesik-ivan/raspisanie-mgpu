/* Иконки — инлайновый SVG. Внешних иконочных шрифтов и CDN нет.
   Штрих наследует цвет текста через currentColor, поэтому тёмная тема
   и активная вкладка работают сами, без второго набора файлов. */

const S = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7"
    stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${d}${extra}</svg>`;

const ICONS = {
  today: S('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v3M16 2.5v3"/><circle cx="12" cy="15" r="2.2" fill="currentColor" stroke="none"/>'),
  week: S('<rect x="3" y="4.5" width="18" height="16" rx="3"/><path d="M3 9.5h18M8 2.5v3M16 2.5v3M7.5 13h3M13.5 13h3M7.5 17h3M13.5 17h3"/>'),
  changes: S('<path d="M4 7h11M4 7l3-3M4 7l3 3"/><path d="M20 17H9M20 17l-3-3M20 17l-3 3"/>'),
  more: S('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  rooms: S('<path d="M4 20.5V6.2a1 1 0 0 1 .6-.9l7-3a1 1 0 0 1 1.4.9V20.5M4 20.5h16M13 10.5h6a1 1 0 0 1 1 1v9"/><circle cx="9" cy="12.5" r="1" fill="currentColor" stroke="none"/>'),
  grid: S('<rect x="3" y="4" width="18" height="17" rx="2.5"/><path d="M3 9h18M9 9v12M15 9v12"/>'),
  teacher: S('<circle cx="12" cy="8" r="3.4"/><path d="M5 20.5c0-3.6 3.1-6.1 7-6.1s7 2.5 7 6.1"/>'),
  back: S('<path d="M15 5l-7 7 7 7"/>'),
  close: S('<path d="M6 6l12 12M18 6L6 18"/>'),
  search: S('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>'),
  chevron: S('<path d="M9 5l7 7-7 7"/>'),
  warn: S('<path d="M12 3.5 2.8 19.5h18.4L12 3.5Z"/><path d="M12 9.5v4.5"/><circle cx="12" cy="16.8" r="1" fill="currentColor" stroke="none"/>'),
  online: S('<rect x="2.5" y="5" width="19" height="12.5" rx="2.5"/><path d="M8 21h8M12 17.5V21"/>'),
  pin: S('<path d="M12 21s7-6.2 7-11a7 7 0 1 0-14 0c0 4.8 7 11 7 11Z"/><circle cx="12" cy="10" r="2.5"/>'),
  clock: S('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3.2 2"/>'),
};

export function icon(name) {
  const svg = ICONS[name];
  if (!svg) {
    console.warn('icons: нет иконки', name);
    return ICONS.more;
  }
  return svg;
}

export function iconNames() { return Object.keys(ICONS); }
