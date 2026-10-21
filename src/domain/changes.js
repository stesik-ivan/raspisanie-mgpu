/* Изменение на дату: отмена, замена преподавателя, смена аудитории, перенос.

   Проверяется так же, как занятие, но для одного вхождения: накладываем
   кандидата поверх уже внесённых изменений и ищем конфликты в тот день,
   куда вхождение попало. Перенос на занятое время — ошибка (docs/02,
   случай 10), отмена конфликтов не даёт никогда. */

import { applyChanges } from './occurrences.js';
import { findConflicts, orientConflict } from './conflicts.js';
import { isIso } from './dates.js';

export const CHANGE_TYPES = ['cancel', 'teacher', 'room', 'move'];

/** Изменение того же типа на то же вхождение заменяет прежнее, а не складывается с ним. */
export function sameSlot(a, b) {
  return a.lessonId === b.lessonId && a.date === b.date && a.type === b.type;
}

/**
 * @param {object} candidate {id, lessonId, date, type, patch}
 * @param {{raw:object[], changes:object[]}} data вхождения без изменений и уже внесённые изменения
 * @returns {{target:object|null, conflicts:object[]}}
 */
export function checkChange(candidate, { raw, changes }, ctx) {
  const others = (changes || []).filter(c => c.id !== candidate.id && !sameSlot(c, candidate));
  const all = applyChanges(raw, [...others, candidate], ctx);
  const target = all.find(o => o.lessonId === candidate.lessonId && o.changeIds.includes(candidate.id)) || null;
  if (!target || target.status === 'cancelled') return { target, conflicts: [] };

  const isTarget = (o) => o && o.lessonId === target.lessonId && o.date === target.date;
  const conflicts = findConflicts(all.filter(o => o.date === target.date), ctx)
    .filter(c => isTarget(c.a) || isTarget(c.b))
    .map(c => orientConflict(c, target.lessonId, ctx));
  return { target, conflicts };
}

/**
 * Чего не хватает и что бессмысленно: замена на того же преподавателя,
 * «смена» на ту же аудиторию, перенос туда же.
 * @param {object} ch кандидат
 * @param {object|null} occ вхождение до изменения
 * @returns {{field:string, message:string}[]}
 */
export function validateChange(ch, occ) {
  const p = ch?.patch || {};
  if (!occ) return [{ field: 'date', message: 'В этот день занятия нет' }];
  if (!CHANGE_TYPES.includes(ch.type)) return [{ field: 'type', message: 'Выберите, что изменить' }];
  const out = [];
  if (ch.type === 'teacher') {
    if (!p.teacherIds?.length) out.push({ field: 'teacherIds', message: 'Выберите, кто заменит' });
    else if (p.teacherIds.every(t => occ.teacherIds.includes(t)) && p.teacherIds.length === occ.teacherIds.length) {
      out.push({ field: 'teacherIds', message: 'Это тот же преподаватель' });
    }
  }
  if (ch.type === 'room') {
    if (!p.roomId) out.push({ field: 'roomId', message: 'Выберите аудиторию' });
    else if (p.roomId === occ.roomId) out.push({ field: 'roomId', message: 'Занятие и так в этой аудитории' });
  }
  if (ch.type === 'move') {
    if (!isIso(p.date)) out.push({ field: 'date', message: 'Выберите дату переноса' });
    else if (!Number.isInteger(p.slot)) out.push({ field: 'slot', message: 'Выберите пару' });
    else if (p.date === occ.date && p.slot === occ.slot) out.push({ field: 'date', message: 'Перенос на то же время — не перенос' });
  }
  return out;
}
