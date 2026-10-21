/* Разбор ячейки сетки: что это за занятие и, если есть конфликт,
   с кем именно оно пересеклось и куда его можно переставить — в один тап.

   Тексты конфликтов приходят готовыми из domain/conflicts.js. Они написаны
   так, чтобы их можно было прочитать вслух: на показе именно это и
   произойдёт. */

import * as api from '../../data/api.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { toast } from '../../ui/toast.js';
import { icon } from '../../ui/icons.js';
import { humanError } from '../../data/errors.js';
import { openLessonForm } from './lesson-form.js';
import { openChangeForm } from './change-form.js';
import { esc } from '../../ui/search.js';
import { kindName, longDate, shortDate } from '../../ui/format.js';

/**
 * @param {string} lessonId
 * @param {string} date
 * @param {object} grid ответ api.getGridView
 * @param {{onChanged?:Function}} [o] перерисовать сетку после правки
 */
export async function openConflictSheet(lessonId, date, grid, { onChanged = null } = {}) {
  const cell = grid.cells.find(c => c.lessonId === lessonId && c.date === date);
  if (!cell) return;

  const err = cell.conflicts.filter(c => c.level === 'error');
  const warn = cell.conflicts.filter(c => c.level === 'warning');

  openSheet({
    title: cell.discipline,
    html: `
      <div class="sh-hero${err.length ? ' is-error' : ''}">
        <p class="sh-kind">${esc(kindName(cell.kind))}${cell.published === false ? ' · черновик' : ''}</p>
        <p class="sh-when">${esc(longDate(cell.date))}</p>
        <p class="sh-time">${esc(cell.start)} – ${esc(cell.end)} <span class="sh-dim">· ${cell.slot} пара</span></p>
      </div>

      <dl class="sh-rows">
        <div class="sh-row"><dt>${icon('pin')} Где</dt>
          <dd>${esc(cell.roomLabel)}${cell.building ? `<span class="sh-dim">${esc(cell.building.code)}, ${esc(cell.building.address)}</span>` : ''}</dd></div>
        <div class="sh-row"><dt>${icon('teacher')} Кто ведёт</dt>
          <dd>${cell.teachers.map(t => `${esc(t.fio)} <span class="sh-dim">${esc(t.position)}</span>`).join('<br>') || '—'}</dd></div>
        <div class="sh-row"><dt>${icon('grid')} Группы</dt>
          <dd>${cell.groups.map(g => esc(g.code)).join(' + ')}${cell.subgroup ? `, подгруппа ${esc(cell.subgroup)}` : ''}</dd></div>
      </dl>

      ${err.length ? problem('Конфликт', err, 'error') : ''}
      ${warn.length ? problem('Предупреждение', warn, 'warn') : ''}
      ${!cell.conflicts.length ? `<p class="sh-ok">${icon('clock')} Конфликтов нет</p>` : ''}

      <div class="sh-free" data-free></div>
      <div class="sh-acts" data-acts></div>
    `,
    onMount: (el) => {
      if (err.length) fillFreeRooms(el, cell, onChanged);
      fillActions(el, cell, onChanged);
    },
  });
}

function problem(title, list, kind) {
  return `
    <section class="sh-sect">
      <h3 class="sh-sect-title">${esc(title)}</h3>
      <ul class="cf-list">
        ${list.map(c => `<li class="cf cf-${kind}"><span class="cf-ico">${icon('warn')}</span>
          <span>${esc(c.message)}</span></li>`).join('')}
      </ul>
      ${kind === 'error'
        ? '<p class="sh-text">В Excel этого не видно: пара и урок стоят под разными номерами, а идут в одно время в одной аудитории.</p>'
        : '<p class="sh-text">Сохранить можно, но лучше знать заранее.</p>'}
    </section>`;
}

/* Свободные аудитории того же типа в том же корпусе — чтобы конфликт
   можно было не просто увидеть, а сразу решить. Свободные на всех датах
   занятия: аудитория меняется у занятия целиком, а не на одну среду. */
async function fillFreeRooms(el, cell, onChanged) {
  const host = el.querySelector('[data-free]');
  if (!host || !cell.room) return;
  try {
    const [free, editable] = await Promise.all([
      api.getRoomOptions(cell.lessonId), api.canEditLesson(cell.lessonId),
    ]);
    host.innerHTML = `
      <section class="sh-sect">
        <h3 class="sh-sect-title">Свободно в это время${cell.building ? `, ${esc(cell.building.code)}` : ''}</h3>
        ${!free.length
          ? '<p class="sh-text sh-dim">Свободных аудиторий того же типа в этом корпусе нет.</p>'
          : editable
            ? `<div class="room-picks">${free.map(r =>
                `<button class="room-pick" data-room="${esc(r.id)}" data-room-name="${esc(r.name)}"
                  aria-label="Пересадить в ${esc(r.name)}">${esc(r.name)}</button>`).join('')}</div>
               <p class="sh-text sh-dim">Выберите аудиторию, и занятие переедет в неё на всех своих датах.</p>`
            : `<ul class="date-chips">${free.map(r => `<li class="date-chip">${esc(r.name)}</li>`).join('')}</ul>
               <p class="sh-text sh-dim">Пересадить может администратор этого подразделения.</p>`}
      </section>`;
    if (editable) {
      host.addEventListener('click', (e) => {
        const b = e.target.closest('[data-room]');
        if (b) moveTo(host, b, cell, onChanged);
      });
    }
  } catch (err) {
    console.error('conflict-sheet: не собрал свободные аудитории', err);
    host.innerHTML = '';
  }
}

/* Правка — только в своей зоне. Кнопок не показываем, а не прячем за отказ:
   в чужой зоне админу нечего нажимать. */
async function fillActions(el, cell, onChanged) {
  const host = el.querySelector('[data-acts]');
  try {
    if (!host || !(await api.canEditLesson(cell.lessonId))) return;
    // У перенесённой пары изменение привязано к дню, откуда её перенесли.
    const origin = cell.movedFrom?.date || cell.date;
    host.innerHTML = `
      <button class="btn" data-change>Изменение на ${esc(shortDate(origin))}</button>
      <button class="btn" data-edit>Изменить занятие</button>`;
    host.addEventListener('click', (e) => {
      if (e.target.closest('[data-change]')) openChangeForm({ lessonId: cell.lessonId, date: origin, onChanged });
      if (e.target.closest('[data-edit]')) openLessonForm({ unitId: null, lessonId: cell.lessonId, onChanged });
    });
  } catch (err) {
    console.error('conflict-sheet: не проверил, можно ли править', err);
  }
}

async function moveTo(host, btn, cell, onChanged) {
  const buttons = [...host.querySelectorAll('[data-room]')];
  buttons.forEach(b => { b.disabled = true; });
  btn.setAttribute('aria-busy', 'true');
  const was = cell.roomLabel;
  const label = was.replace(cell.room.name, btn.dataset.roomName);
  try {
    const { auditId } = await api.saveLesson(cell.lessonId, { roomId: btn.dataset.room }, { version: cell.version });
    closeSheet();
    await onChanged?.();
    toast(`${label}: конфликт снят`, auditId ? { label: 'Отменить', fn: () => undo(auditId, was, onChanged) } : null);
  } catch (err) {
    console.error('conflict-sheet: не пересадил занятие', err);
    buttons.forEach(b => { b.disabled = false; });
    btn.removeAttribute('aria-busy');
    toast(humanError(err));
  }
}

async function undo(auditId, was, onChanged) {
  try {
    await api.revert(auditId);
    await onChanged?.();
    toast(`Вернул: ${was}`);
  } catch (err) {
    console.error('conflict-sheet: не отменил пересадку', err);
    toast(humanError(err));
  }
}
