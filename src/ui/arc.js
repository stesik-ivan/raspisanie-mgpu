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

/** Крупная светлая дуга для пустых состояний. */
export function emptyArc(size = 112) {
  return arc({ progress: 0.72, size, width: 3 });
}

/** Вращающаяся дуга — загрузка. */
export function spinner(size = 40) {
  return arc({ spin: true, size, width: 4, title: 'Загрузка' });
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
}
