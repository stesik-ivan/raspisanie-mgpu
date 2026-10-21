/* Склейка состояния и домена.

   Домен ничего не знает про хранилище: ему нужны вхождения и справочники.
   Этот модуль собирает из состояния то, что домен просит, — и он же будет
   собирать это из ответов PocketBase, когда сервер появится. */

import { lessonOccurrences, applyChanges } from '../domain/occurrences.js';
import { publishedLessons, workingLessons } from '../domain/drafts.js';

/** Контекст для функций домена. */
export function domainCtx(state) {
  const bells = new Map((state.bellSchedules || []).map(b => [b.id, b]));
  const groups = new Map((state.groups || []).map(g => [g.id, g]));
  const programs = new Map((state.programs || []).map(p => [p.id, p]));
  const units = new Map((state.units || []).map(u => [u.id, u]));
  const disciplines = new Map((state.disciplines || []).map(d => [d.id, d.name]));
  const teachers = new Map((state.teachers || []).map(t => [t.id, t]));

  const terms = state.terms || [];
  const termFrom = terms.length ? terms.map(t => t.from).sort()[0] : '2026-09-01';
  const termTo = terms.length ? terms.map(t => t.to).sort().at(-1) : '2026-12-30';

  return {
    termFrom,
    termTo,
    rooms: state.rooms || [],
    groups: state.groups || [],
    buildings: state.buildings || [],
    unitOf(groupId) {
      const g = groups.get(groupId);
      const p = g && programs.get(g.programId);
      return p ? units.get(p.unitId) : null;
    },
    bellScheduleOf(groupId) {
      const unit = this.unitOf(groupId);
      return unit ? bells.get(unit.bellScheduleId) : null;
    },
    disciplineName: (id) => disciplines.get(id) || id,
    teacherName: (id) => teachers.get(id)?.fio || id,
    teacherOf: (id) => teachers.get(id) || null,
    roomOf: (id) => (state.rooms || []).find(r => r.id === id) || null,
    groupOf: (id) => groups.get(id) || null,
  };
}

/**
 * Вхождения с наложенными изменениями.
 * @param {object} state
 * @param {{groupId?:string, teacherId?:string, includeDraft?:boolean}} q
 */
export function occurrencesOf(state, q = {}) {
  const ctx = domainCtx(state);
  // Студент видит опубликованные версии, админ — рабочие копии с черновиками.
  const source = q.includeDraft ? workingLessons(state.lessons) : publishedLessons(state.lessons);
  const lessons = source.filter(l =>
    (!q.groupId || l.groupIds.includes(q.groupId)) &&
    (!q.teacherId || l.teacherIds.includes(q.teacherId)));

  const ids = new Set(lessons.map(l => l.id));
  const changes = (state.changes || []).filter(c =>
    (c.lessonId && ids.has(c.lessonId)) ||
    (c.type === 'extra' && matchesExtra(c, q)));

  const raw = lessons.flatMap(l => lessonOccurrences(l, ctx).occurrences);
  return applyChanges(raw, changes, ctx);
}

function matchesExtra(c, q) {
  const p = c.patch || {};
  if (q.groupId) return (p.groupIds || []).includes(q.groupId);
  if (q.teacherId) return (p.teacherIds || []).includes(q.teacherId);
  return true;
}

/** Все вхождения подразделения — для сетки админа и поиска свободных аудиторий. */
export function allOccurrences(state, { includeDraft = false } = {}) {
  return occurrencesOf(state, { includeDraft });
}
