/* Карточка свободной аудитории у преподавателя: занять до нужного времени.

   Варианты «до» считает domain/bookings.js: полчасовые отметки и
   последней — «пока свободна» (до следующей пары) или «весь день».
   Занятая аудитория пропадает из свободных у всех, пока её не освободят. */

import * as api from '../../data/api.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { esc } from '../../ui/search.js';
import { longDate, kindName } from '../../ui/format.js';
import { humanError } from '../../data/errors.js';
import { today, nowMinutes } from '../../data/clock.js';
import { toMinutes } from '../../domain/bells.js';
import { bookingEnds } from '../../domain/bookings.js';

/**
 * @param {object} room элемент ответа api.getFreeRoomsNow
 * @param {{label:string, onChanged?:Function}} o
 */
export async function openRoomBooking(room, { label, onChanged = null }) {
  const ends = bookingEnds(nowMinutes(), room.freeUntil ? toMinutes(room.freeUntil) : null);
  let busy = [];
  try { busy = await api.getRoomBusy(room.id, today()); }
  catch (err) { console.error('room-book: не загрузил занятость', err); }

  openSheet({
    title: label,
    html: `
      <p class="sh-text sh-dim">${room.building ? `${esc(room.building.code)}, ${esc(room.building.address)} · ` : ''}${esc(longDate(today()))}</p>
      <section class="sh-sect">
        <h3 class="sh-sect-title">Занять до</h3>
        ${ends.length ? `<div class="room-picks">${ends.map((e, i) => {
          const last = i === ends.length - 1;
          const note = last ? (room.freeUntil ? 'пока свободна' : 'весь день') : '';
          return `<button class="room-pick book-pick" data-end="${e}" aria-label="Занять до ${e}${note ? `, ${note}` : ''}">
            ${e}${note ? `<span class="book-note">${note}</span>` : ''}</button>`;
        }).join('')}</div>
        <p class="sh-text sh-dim">Аудитория станет занятой для всех, пока вы её не освободите.</p>`
        : '<p class="sh-text sh-dim">Сегодня занимать уже поздно.</p>'}
      </section>
      <section class="sh-sect">
        <h3 class="sh-sect-title">Сегодня в аудитории</h3>
        ${busy.length ? `<ul class="peek">${busy.map(o => `
          <li class="peek-row${o.status === 'cancelled' ? ' is-cancelled' : ''}">
            <span class="peek-when">${esc(o.start)}<br><span class="sh-dim">${esc(o.end)}</span></span>
            <span class="peek-body">
              <span class="peek-name">${esc(o.discipline)}${o.kind && o.kind !== 'бронь' ? ` <span class="sh-dim">${esc(kindName(o.kind))}</span>` : ''}</span>
              <span class="sh-dim">${[o.groups.map(g => esc(g.code)).join(' + '), o.teachers.map(t => esc(t.fio)).join(', ')].filter(Boolean).join(' · ')}</span>
            </span>
          </li>`).join('')}</ul>` : '<p class="sh-empty">Сегодня здесь пар нет</p>'}
      </section>`,
    onMount: (el) => el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-end]');
      if (b) book(el, b, room, label, onChanged);
    }),
  });
}

async function book(el, btn, room, label, onChanged) {
  el.querySelectorAll('[data-end]').forEach(x => { x.disabled = true; });
  try {
    const { booking } = await api.bookRoom({ roomId: room.id, end: btn.dataset.end });
    closeSheet();
    await onChanged?.();
    toast(`${label} ваша до ${booking.end}`, { label: 'Освободить', fn: () => release(booking.id, onChanged) });
  } catch (err) {
    console.error('room-book: не занял аудиторию', err);
    el.querySelectorAll('[data-end]').forEach(x => { x.disabled = false; });
    toast(humanError(err));
  }
}

/** Освободить бронь — из тоста или из списка «Мои брони». */
export async function release(id, onChanged) {
  try {
    await api.cancelBooking(id);
    await onChanged?.();
    toast('Аудитория снова свободна');
  } catch (err) {
    console.error('room-book: не освободил аудиторию', err);
    toast(humanError(err));
  }
}
