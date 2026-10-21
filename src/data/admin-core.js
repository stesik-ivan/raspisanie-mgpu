/* Общее для записи: кто правит, что ему можно, журнал, конфликты кандидата.

   Нужно и правке занятий (api-admin.js), и изменениям на дату
   (api-changes.js). Экраны сюда не ходят: только через api.js. */

import { occurrencesOf } from './ctx.js';
import { ApiError } from './errors.js';
import { now, toIsoDate } from './clock.js';
import { lessonOccurrences, applyChanges } from '../domain/occurrences.js';
import { checkLesson } from '../domain/conflicts.js';

/* ---------- кто правит и что ему можно ---------- */

export function currentAdmin(s) {
  const id = s.prefs.adminId || s.admins[0]?.id;
  return s.admins.find(a => a.id === id) || null;
}

export function unitIdOfGroup(s, groupId) {
  const g = s.groups.find(x => x.id === groupId);
  return s.programs.find(p => p.id === g?.programId)?.unitId || null;
}

/** Все группы занятия должны быть в зоне админа: поток с чужой группой — чужой. */
export function assertZone(s, admin, lesson) {
  if (!admin) throw new ApiError('foreign', 'Войдите как администратор, чтобы править расписание.');
  const foreign = (lesson.groupIds || []).map(g => unitIdOfGroup(s, g)).find(u => !admin.unitIds.includes(u));
  if (foreign !== undefined) {
    const unit = s.units.find(u => u.id === foreign);
    throw new ApiError('foreign',
      `Это расписание ведёт ${unit?.short || 'другое подразделение'}. Видеть его можно, править — только его администратору.`);
  }
}

/* ---------- вхождения и конфликты кандидата ---------- */

export function candidateOccurrences(s, ctx, lesson) {
  const raw = lessonOccurrences(lesson, ctx).occurrences;
  return applyChanges(raw, s.changes.filter(c => c.lessonId === lesson.id), ctx);
}

export function conflictsOf(s, ctx, lesson) {
  const existing = occurrencesOf(s, { includeDraft: true });
  return checkLesson(candidateOccurrences(s, ctx, lesson), existing, ctx);
}

/* ---------- журнал ---------- */

export function stamp() {
  const d = now();
  return `${toIsoDate(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function writeAudit(s, admin, entry) {
  const id = `AU-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  // Журнал отсортирован от новых к старым — новая запись встаёт первой.
  s.audit.unshift({
    id, at: stamp(), adminId: admin.id, ...entry,
    before: entry.before ? structuredClone(entry.before) : null,
    after: entry.after ? structuredClone(entry.after) : null,
  });
  return id;
}
