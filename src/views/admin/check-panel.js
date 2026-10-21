/* Панель проверки в форме занятия. Перерисовывается при каждой правке поля.

   Порядок — от «нельзя сохранить» к «можно, но знайте»:
   чего не хватает → какие даты не разобраны → ошибки → предупреждения.
   Ошибка блокирует сохранение, предупреждение снимается галочкой (docs/02). */

import { esc } from '../../ui/search.js';
import { icon } from '../../ui/icons.js';
import { ru } from '../../domain/dates.js';
import { plural as pluralOf } from '../../ui/format.js';

const FIELD_NAMES = {
  disciplineId: 'дисциплину', groupIds: 'группу', teacherIds: 'преподавателя',
  roomId: 'аудиторию', weekday: 'день', slot: 'пару', dateRule: 'даты',
  date: 'дату', type: 'что изменить',
};

/**
 * @param {object} r ответ api.checkLessonDraft
 * @param {{bad:string[], ack:boolean, freeTitle:string}} o
 *   freeTitle — подпись к свободным аудиториям: у занятия они свободны на
 *   всех датах, у изменения на дату — в это время
 * @returns {{html:string, canSave:boolean, needsAck:boolean}}
 */
export function checkPanel(r, { bad = [], ack = false, freeTitle = 'Свободны на всех датах:' } = {}) {
  const errors = r.conflicts.filter(c => c.level === 'error');
  const warns = r.conflicts.filter(c => c.level === 'warning');
  // Незаполненное перечисляем одной строкой: в пустой форме это не ошибка,
  // а подсказка, что осталось.
  const missing = r.problems.filter(p => FIELD_NAMES[p.field] && /^(Выберите|Задайте)/.test(p.message));
  const other = r.problems.filter(p => !missing.includes(p));
  const needsAck = !errors.length && warns.length > 0;
  const canSave = !r.problems.length && !bad.length && !errors.length && (!needsAck || ack);

  const parts = [];
  if (missing.length) {
    parts.push(`<p class="cp-todo">Осталось выбрать: ${missing.map(p => esc(FIELD_NAMES[p.field])).join(', ')}.</p>`);
  }
  for (const p of other) parts.push(line('error', p.message));
  if (bad.length) parts.push(line('error', `Не понял даты: ${bad.join(', ')}. Пишите как 07.09, 21.09.`));

  if (!r.problems.length && r.dates.length) {
    parts.push(`<p class="cp-dates">${r.dates.length} ${plural(r.dates.length)}: ${esc(ru(r.dates[0]))} – ${esc(ru(r.dates.at(-1)))}</p>`);
  }

  for (const c of errors) parts.push(line('error', c.message, c.dates));
  if (errors.length) parts.push('<p class="sh-text">С конфликтом сохранить нельзя.</p>');

  if (r.freeRooms.length) {
    parts.push(`
      <div class="cp-free">
        <p class="cp-free-title">${esc(freeTitle)}</p>
        <div class="room-picks">${r.freeRooms.map(x =>
          `<button type="button" class="room-pick" data-pick-room="${esc(x.id)}" aria-label="Поставить в ${esc(x.name)}">${esc(x.name)}</button>`).join('')}</div>
      </div>`);
  }

  for (const c of warns) parts.push(line('warn', c.message, c.dates));
  if (needsAck) {
    parts.push(`<label class="cp-ack"><input type="checkbox" name="ack"${ack ? ' checked' : ''}> Понимаю, сохранить с предупреждением</label>`);
  }

  if (r.warnings.length) {
    parts.push(`<ul class="cp-notes">${[...new Set(r.warnings)].slice(0, 4).map(w => `<li>${esc(w)}</li>`).join('')}</ul>`);
  }

  if (!r.problems.length && !bad.length && !r.conflicts.length) {
    parts.push(`<p class="sh-ok">${icon('clock')} Конфликтов нет</p>`);
  }

  return { html: parts.join(''), canSave, needsAck };
}

function line(kind, message, dates = []) {
  const more = dates.length > 1 ? ` <span class="cf-more">То же ещё ${dates.length - 1} ${plural(dates.length - 1)}.</span>` : '';
  return `<p class="cf cf-${kind}"><span class="cf-ico">${icon('warn')}</span><span>${esc(message)}${more}</span></p>`;
}

const plural = (n) => pluralOf(n, 'дата', 'даты', 'дат');
