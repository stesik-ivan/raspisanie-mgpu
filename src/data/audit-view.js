/* Запись журнала словами: о чём она и что поменялось.

   В журнале лежат полные «до» и «после» (по ним работает отмена). Человеку
   нужно другое: «Анатомия человека · УЧБИХ-261», «Аудитория: Ауд. 133 →
   Ауд. 212». На показе спросят «а что это за L15» — ответ должен быть
   на экране. */

import { diffLabels, lessonTitle } from './diff-labels.js';
import { roomLabel } from './decorate.js';
import { ru, ruleText } from '../domain/dates.js';
import { plural } from '../ui/format.js';

/**
 * @returns {{title:string, details:{label:string, from:string, to:string}[], note:string, groupIds:string[]}}
 */
export function describeAudit(a, s, ctx) {
  if (a.entity === 'Term') return term(a, s);
  if (a.entity === 'Change') return change(a, s, ctx);
  return lesson(a, s, ctx);
}

function lesson(a, s, ctx) {
  const l = a.after || a.before || s.lessons.find(x => x.id === a.entityId);
  const both = a.before && a.after && !a.after.deleted && !a.before.deleted;
  // У создания и удаления разницы нет — показываем, на какие даты.
  let details = both ? diffLabels(a.before, a.after, ctx).map(({ label, from, to }) => ({ label, from, to })) : [];
  if (!a.before && a.after) details = [{ label: 'Новое', from: '', to: ruleText(a.after.dateRule) }];
  if (a.before && (!a.after || a.after.deleted)) details = [{ label: 'Убрано', from: '', to: ruleText(a.before.dateRule) }];
  return {
    title: l ? lessonTitle(l, ctx) : '',
    details,
    note: '',
    groupIds: l?.groupIds || [],
  };
}

function change(a, s, ctx) {
  const ch = a.after || a.before || s.changes.find(c => c.id === a.entityId) || null;
  // В записях из сида entityId — занятие, а не изменение.
  const l = s.lessons.find(x => x.id === (ch?.lessonId ?? a.entityId));
  const name = l ? [ctx.disciplineName(l.disciplineId), l.groupIds.map(g => ctx.groupOf(g)?.code || g).join(' + ')].join(' · ') : '';
  return {
    title: [name, ch?.date ? ru(ch.date) : ''].filter(Boolean).join(' · '),
    details: ch && l ? [what(ch, l, ctx)] : [],
    note: '',
    groupIds: l?.groupIds || [],
  };
}

function what(ch, l, ctx) {
  const p = ch.patch || {};
  const people = (ids) => (ids || []).map(id => ctx.teacherOf(id)?.fio || id).join(', ');
  switch (ch.type) {
    case 'cancel': return { label: 'Отмена', from: '', to: ch.reason || 'без причины' };
    case 'teacher': return { label: 'Преподаватель', from: people(l.teacherIds), to: people(p.teacherIds) };
    case 'room': return { label: 'Аудитория', from: roomLabel(ctx.roomOf(l.roomId)), to: roomLabel(ctx.roomOf(p.roomId)) };
    case 'move': return { label: 'Перенос', from: `${ru(ch.date)}, ${l.slot} пара`, to: `${ru(p.date)}, ${p.slot} пара` };
    default: return { label: 'Изменение', from: '', to: ch.reason || '' };
  }
}

function term(a, s) {
  const t = s.terms.find(x => x.id === a.entityId);
  const unit = t && s.units.find(u => u.id === t.unitId);
  const n = a.after?.count;
  return {
    title: unit?.short || '',
    details: a.after?.version != null
      ? [{ label: 'Версия', from: String(a.before?.version ?? '—'), to: String(a.after.version) }] : [],
    note: n ? `${n} ${plural(n, 'правка', 'правки', 'правок')}` : '',
    groupIds: [],
  };
}
