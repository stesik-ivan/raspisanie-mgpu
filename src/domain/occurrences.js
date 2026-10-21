/* Вхождения занятия.

   Вхождение — это занятие в конкретный день: `{lessonId, date, start, end,
   groupIds, subgroup, teacherIds, roomId}`. Всё остальное в системе —
   экраны студента, сетка админа, проверка конфликтов, выгрузка в календарь —
   работает с вхождениями, а не с занятиями. Это шов между тремя источниками:
   правилом дат, сеткой звонков и изменениями на дату.

   Отмена не удаляет вхождение, а ставит status 'cancelled': студенту надо
   показать зачёркнутое время и подпись «Отменено», а удалённое вхождение
   показать нечем. Из проверки конфликтов отменённые выпадают. */

import { expandDateRule, weekdayOf } from './dates.js';
import { slotTime } from './bells.js';

/**
 * @param {object} lesson
 * @param {{bellScheduleOf:(groupId:string)=>object, termFrom:string, termTo:string}} ctx
 * @returns {{occurrences: object[], warnings: string[]}}
 */
export function lessonOccurrences(lesson, ctx) {
  const warnings = [];
  if (!lesson) return { occurrences: [], warnings };

  const { dates, warnings: dateWarnings } = expandDateRule(lesson.dateRule, {
    weekday: lesson.weekday, termFrom: ctx.termFrom, termTo: ctx.termTo,
  });
  warnings.push(...dateWarnings);

  // Время берём из сетки первой группы (docs/02). Если группы потока сидят
  // на разных сетках, это ошибка набора: поток ВО+СПО невозможен.
  const bells = ctx.bellScheduleOf(lesson.groupIds?.[0]);
  if (lesson.groupIds?.length > 1) {
    const ids = new Set(lesson.groupIds.map(g => ctx.bellScheduleOf(g)?.id));
    if (ids.size > 1) {
      warnings.push(`Группы потока сидят на разных сетках звонков: ${lesson.groupIds.join(', ')}`);
    }
  }

  const occurrences = [];
  for (const date of dates) {
    const time = slotTime(bells, weekdayOf(date), lesson.slot);
    if (!time) {
      warnings.push(`В сетке нет пары №${lesson.slot} на ${DOW[weekdayOf(date)]}`);
      continue;
    }
    occurrences.push(make(lesson, date, lesson.slot, time));
  }

  // Предупреждение о пропущенной паре одно, даже если дат много.
  return { occurrences, warnings: [...new Set(warnings)] };
}

function make(lesson, date, slot, time) {
  return {
    lessonId: lesson.id,
    disciplineId: lesson.disciplineId,
    kind: lesson.kind,
    date,
    slot,
    start: time.start,
    end: time.end,
    groupIds: [...(lesson.groupIds || [])],
    subgroup: lesson.subgroup ?? null,
    teacherIds: [...(lesson.teacherIds || [])],
    roomId: lesson.roomId ?? null,
    status: 'ok',
    changeIds: [],
  };
}

/**
 * Накладывает изменения на дату поверх вхождений.
 *
 * Порядок важен: сначала отмены, потом переносы, потом точечные замены,
 * потом добавленные занятия. Отменённое не двигается — иначе отмена и
 * перенос на одну дату дали бы призрак в новом дне.
 *
 * @param {object[]} occurrences
 * @param {object[]} changes
 * @param {{bellScheduleOf:Function}} ctx
 */
export function applyChanges(occurrences, changes, ctx) {
  let out = occurrences.map(o => ({ ...o, groupIds: [...o.groupIds], teacherIds: [...o.teacherIds], changeIds: [...o.changeIds] }));
  const list = Array.isArray(changes) ? changes : [];

  for (const type of ['cancel', 'move', 'teacher', 'room', 'extra']) {
    for (const ch of list.filter(c => c?.type === type)) {
      if (type === 'extra') { out.push(...extra(ch, ctx)); continue; }

      const hit = out.find(o =>
        o.lessonId === ch.lessonId && o.date === ch.date && o.status !== 'cancelled');
      if (!hit) continue;

      if (type === 'cancel') {
        hit.status = 'cancelled';
      } else if (type === 'move') {
        move(hit, ch, ctx);
      } else if (type === 'teacher' && ch.patch?.teacherIds) {
        // Кого заменили — такая же часть изменения, как и кем. Студенту
        // нужно «вместо Петрова», а не только фамилия пришедшего (docs/03).
        hit.replacedTeacherIds = [...hit.teacherIds];
        hit.teacherIds = [...ch.patch.teacherIds];
      } else if (type === 'room' && 'roomId' in (ch.patch || {})) {
        hit.roomId = ch.patch.roomId;
      }
      hit.changeIds.push(ch.id);
      if (ch.reason) hit.reason = ch.reason;
    }
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start));
}

function move(hit, ch, ctx) {
  const date = ch.patch?.date ?? hit.date;
  const slot = ch.patch?.slot ?? hit.slot;
  const bells = ctx.bellScheduleOf(hit.groupIds[0]);
  const time = slotTime(bells, weekdayOf(date), slot);
  if (!time) return;   // некуда переносить — оставляем на месте
  hit.date = date;
  hit.slot = slot;
  hit.start = time.start;
  hit.end = time.end;
  hit.moved = true;
}

function extra(ch, ctx) {
  const p = ch.patch || {};
  const date = ch.date;
  const bells = ctx.bellScheduleOf(p.groupIds?.[0]);
  const time = slotTime(bells, weekdayOf(date), p.slot);
  if (!time) return [];
  const occ = make({ id: ch.id, ...p }, date, p.slot, time);
  occ.lessonId = ch.lessonId ?? ch.id;
  occ.changeIds = [ch.id];
  occ.isExtra = true;
  if (ch.reason) occ.reason = ch.reason;
  return [occ];
}

const DOW = [, 'понедельник', 'вторник', 'среду', 'четверг', 'пятницу', 'субботу', 'воскресенье'];
