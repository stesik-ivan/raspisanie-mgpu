/* Короткое сообщение внизу. Из «Полки» (`app.js:21-63`) вместе с фиксом
   reflow вместо requestAnimationFrame. */

import { esc } from './search.js';

let timer = null;

/**
 * @param {string} msg
 * @param {{label:string, fn:Function}} [action] кнопка «Отменить»
 */
export function toast(msg, action = null) {
  const t = document.querySelector('#toast');
  if (!t) return;

  t.innerHTML = `<span class="toast-msg">${esc(msg)}</span>`;
  if (action) {
    const b = document.createElement('button');
    b.className = 'toast-undo';
    b.textContent = action.label;
    b.addEventListener('click', () => { hideToast(); action.fn(); });
    t.append(b);
  }

  t.hidden = false;
  // Не через requestAnimationFrame: в фоновой вкладке он не срабатывает,
  // и сообщение так и осталось бы прозрачным.
  void t.offsetWidth;
  t.classList.add('in');

  clearTimeout(timer);
  // На отмену нужно время подумать — обычное сообщение столько не висит.
  timer = setTimeout(hideToast, action ? 8000 : 2400);
}

export function hideToast() {
  const t = document.querySelector('#toast');
  if (!t) return;
  clearTimeout(timer);
  t.classList.remove('in');
  setTimeout(() => { if (!t.classList.contains('in')) t.hidden = true; }, 320);
}
