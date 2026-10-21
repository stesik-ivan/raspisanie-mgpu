/* Дуги и кольца из логотипа МГПУ — узнаваемый элемент интерфейса:
   индикатор загрузки, пустые состояния, прогресс текущей пары.

   Возвращает строку разметки, а не узел: экраны собираются из строк и
   кладутся в #view одним присваиванием. */

/**
 * @param {object} o
 * @param {number} [o.progress] 0..1 — какую долю кольца закрасить акцентом.
 *   Не задан — полное кольцо цветом линии (пустое состояние).
 * @param {number} [o.size] сторона в px
 * @param {number} [o.width] толщина штриха
 * @param {boolean} [o.spin] вращать (загрузка)
 * @param {string} [o.title] доступное имя; без него дуга скрыта от скринридера
 */
export function arc({ progress = null, size = 96, width = 4, spin = false, title = '' } = {}) {
  const r = (100 - width) / 2;
  const c = 2 * Math.PI * r;
  const shown = progress === null ? 1 : Math.max(0, Math.min(1, progress));
  const dash = spin ? c * 0.28 : c * shown;

  const a11y = title
    ? `role="img" aria-label="${esc(title)}"`
    : 'aria-hidden="true" focusable="false"';

  return `<svg class="arc${spin ? ' arc-spin' : ''}" viewBox="0 0 100 100"
    width="${size}" height="${size}" ${a11y}>
    <circle class="arc-track" cx="50" cy="50" r="${r}" fill="none"
      stroke="var(--line-soft)" stroke-width="${width}"/>
    <circle class="arc-fill" cx="50" cy="50" r="${r}" fill="none"
      stroke="${progress === null && !spin ? 'var(--line)' : 'var(--accent)'}"
      stroke-width="${width}" stroke-linecap="round"
      stroke-dasharray="${dash.toFixed(2)} ${c.toFixed(2)}"
      transform="rotate(-90 50 50)"/>
  </svg>`;
}

/* Знак пустого состояния: два замкнутых кольца, как в логотипе, и
   значок внутри. Раньше здесь была незакрашенная на четверть дуга — та же,
   что у загрузки и прогресса пары, — и пустой день выглядел как зависшая
   загрузка. Замкнутое кольцо не «грузится»: оно законченное.

   glyph: 'rest' — месяц (пар нет, можно выдохнуть), 'done' — галочка
   (всё сделано), 'none' — без значка. */
const GLYPHS = {
  rest: '<path d="M57 37a14 14 0 1 0 8 23 12 12 0 0 1-8-23z" fill="var(--line)"/>',
  done: '<path d="M40 50.5l7.5 7.5L61 43" fill="none" stroke="var(--text-2)" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>',
  none: '',
};

/**
 * @param {number} [size] сторона в px
 * @param {'rest'|'done'|'none'} [glyph]
 */
export function emptyArc(size = 112, glyph = 'none') {
  return `<svg class="empty-mark" viewBox="0 0 100 100" width="${size}" height="${size}" aria-hidden="true" focusable="false">
    <circle cx="50" cy="50" r="46" fill="none" stroke="var(--line-soft)" stroke-width="3"/>
    <circle cx="50" cy="50" r="33" fill="none" stroke="var(--accent)" stroke-width="2"/>
    ${GLYPHS[glyph] || ''}
  </svg>`;
}

/** Вращающаяся дуга — загрузка. */
export function spinner(size = 40) {
  return arc({ spin: true, size, width: 4, title: 'Загрузка' });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
