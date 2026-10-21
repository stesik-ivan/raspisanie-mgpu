/* Шторка снизу. Из «Полки» (`app.js:938-975`) вместе с флагом keepScroll. */

import { icon } from './icons.js';
import { esc } from './search.js';

const layer = () => document.querySelector('#sheet-layer');
const sheet = () => document.querySelector('#sheet');

let onCloseCb = null;

/**
 * @param {{title:string, html:string, onMount?:Function, keepScroll?:boolean, onClose?:Function}} o
 */
export function openSheet({ title, html, onMount, keepScroll = false, onClose = null }) {
  const l = layer(), s = sheet();
  const body = s.querySelector('.sh-body');
  const wasAt = keepScroll && body ? body.scrollTop : 0;

  s.innerHTML = `
    <header class="sh-head">
      <h2 class="sh-title" id="sheet-title">${esc(title)}</h2>
      <button class="sh-close" data-sh-close aria-label="Закрыть">${icon('close')}</button>
    </header>
    <div class="sh-body">${html}</div>`;

  const fresh = s.querySelector('.sh-body');
  fresh.scrollTop = wasAt;
  onCloseCb = onClose;

  l.hidden = false;
  // Класс возвращаем всегда: иначе отложенное скрытие после closeSheet
  // успеет стереть только что открытую шторку.
  if (!l.classList.contains('in')) { void l.offsetWidth; l.classList.add('in'); }
  onMount?.(fresh);
}

export function closeSheet() {
  const l = layer();
  if (l.hidden) return;
  l.classList.remove('in');
  const cb = onCloseCb; onCloseCb = null;
  setTimeout(() => {
    if (!l.classList.contains('in')) { l.hidden = true; sheet().innerHTML = ''; }
  }, 360);
  cb?.();
}

export function isSheetOpen() { return !layer().hidden; }

export function initSheet() {
  document.querySelector('#sheet-backdrop')?.addEventListener('click', closeSheet);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && isSheetOpen()) closeSheet();
  });
  sheet()?.addEventListener('click', e => {
    if (e.target.closest('[data-sh-close]')) closeSheet();
  });
}
