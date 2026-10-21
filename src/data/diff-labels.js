/* «Было → стало» словами: id превращаются в названия, правило дат — в
   «каждую неделю с 01.09 по 30.12». Нужно экрану публикации и журналу. */

import { lessonDiff } from '../domain/drafts.js';
import { ruleText } from '../domain/dates.js';
import { roomLabel } from './decorate.js';

const FIELDS = {
  disciplineId: 'Дисциплина', kind: 'Вид', groupIds: 'Группы', subgroup: 'Подгруппа',
  teacherIds: 'Преподаватель', roomId: 'Аудитория', weekday: 'День', slot: 'Пара', dateRule: 'Даты',
};
const DOW = [, 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

function value(field, v, ctx) {
  if (v == null || (Array.isArray(v) && !v.length)) return '—';
  switch (field) {
    case 'disciplineId': return ctx.disciplineName(v);
    case 'groupIds': return v.map(id => ctx.groupOf(id)?.code || id).join(' + ');
    case 'teacherIds': return v.map(id => ctx.teacherOf(id)?.fio || id).join(', ');
    case 'roomId': return roomLabel(ctx.roomOf(v));
    case 'weekday': return DOW[v] || String(v);
    case 'slot': return `${v} пара`;
    case 'subgroup': return `подгруппа ${v}`;
    case 'dateRule': return ruleText(v);
    default: return String(v);
  }
}

/** Разница двух версий занятия словами. */
export function diffLabels(before, after, ctx) {
  return lessonDiff(before, after).map(d => ({
    field: d.field, label: FIELDS[d.field] || d.field,
    from: value(d.field, d.from, ctx), to: value(d.field, d.to, ctx),
  }));
}

/** «Геология · ГШТ-261 + ГОБЩ-261 · ср, 2 пара · Ауд. 304» */
export function lessonTitle(l, ctx) {
  if (!l) return '';
  return [
    ctx.disciplineName(l.disciplineId),
    value('groupIds', l.groupIds, ctx) + (l.subgroup ? `, подгр. ${l.subgroup}` : ''),
    `${DOW[l.weekday] || ''}, ${l.slot} пара`,
    roomLabel(ctx.roomOf(l.roomId)),
  ].filter(Boolean).join(' · ');
}
