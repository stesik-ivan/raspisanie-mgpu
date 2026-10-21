/* Перетаскивание широкой таблицы мышью: зажал кнопку и двигаешь.

   Только для мыши: на телефоне и тачпаде прокрутка и так работает
   пальцем. Перетаскивание начинается после сдвига на несколько пикселей,
   чтобы обычный клик по ячейке оставался кликом, а клик, которым
   закончилось перетаскивание, гасится. Все обработчики висят на самом
   элементе (с захватом указателя), поэтому при перерисовке ничего не
   остаётся висеть на window. */

const THRESHOLD = 5;

/**
 * @param {HTMLElement} el прокручиваемый по горизонтали контейнер
 * @param {{vertical?:HTMLElement|null}} [o] что прокручивать по вертикали
 */
export function dragScroll(el, { vertical = null } = {}) {
  let start = null;
  let dragging = false;
  let swallowClick = false;

  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    if (e.target.closest('input, select, textarea, a')) return;
    start = { x: e.clientX, y: e.clientY, left: el.scrollLeft, top: vertical?.scrollTop ?? 0, id: e.pointerId };
    dragging = false;
  });

  el.addEventListener('pointermove', (e) => {
    if (!start || e.pointerId !== start.id) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!dragging) {
      if (Math.abs(dx) < THRESHOLD && Math.abs(dy) < THRESHOLD) return;
      dragging = true;
      el.setPointerCapture(e.pointerId);
      el.classList.add('is-dragging');
    }
    el.scrollLeft = start.left - dx;
    if (vertical) vertical.scrollTop = start.top - dy;
  });

  const end = (e) => {
    if (!start || e.pointerId !== start.id) return;
    if (dragging) {
      swallowClick = true;
      el.classList.remove('is-dragging');
      if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
    }
    start = null;
    dragging = false;
  };
  el.addEventListener('pointerup', end);
  el.addEventListener('pointercancel', end);

  // Клик, которым закончилось перетаскивание, — не клик по ячейке.
  el.addEventListener('click', (e) => {
    if (!swallowClick) return;
    swallowClick = false;
    e.stopPropagation();
    e.preventDefault();
  }, true);
}
