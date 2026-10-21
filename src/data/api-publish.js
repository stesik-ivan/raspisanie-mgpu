/* Черновик → публикация.

   Студенты читают только опубликованное (domain/drafts.js: publishedLessons).
   Публикует админ свою зону целиком: всё, что накопилось в черновике.
   Пока в черновиках есть конфликт-ошибка, публикации нет — иначе ловушку
   из сцены 2 можно было бы опубликовать нажатием одной кнопки. */

import { ensure, getCtx, commit, tick } from './session.js';
import { ApiError } from './errors.js';
import { today } from './clock.js';
import { currentAdmin, inZone, stamp, writeAudit, conflictsOf, unitIdOfGroup } from './admin-core.js';
import { diffLabels, lessonTitle } from './diff-labels.js';
import { publishLessons, pendingOf } from '../domain/drafts.js';
import { groupConflicts } from '../domain/conflicts.js';

function blockersOf(s, ctx, pending) {
  return pending.filter(p => p.kind !== 'deleted').flatMap(p => {
    const [first] = groupConflicts(conflictsOf(s, ctx, p.lesson).filter(c => c.level === 'error'), { from: today() });
    return first ? [{ id: p.id, title: lessonTitle(p.lesson, ctx), message: first.message, dates: first.dates }] : [];
  });
}

/** Экран публикации: что ждёт, что мешает, какая версия сейчас у студентов. */
export async function getPublishView() {
  await tick();
  const s = ensure(), ctx = getCtx();
  const admin = currentAdmin(s);
  const pending = pendingOf(s.lessons, l => inZone(s, admin, l));
  return {
    admin: admin && { id: admin.id, fio: admin.fio },
    terms: s.terms.filter(t => admin?.unitIds.includes(t.unitId)).map(t => ({
      id: t.id, unit: s.units.find(u => u.id === t.unitId)?.short || t.unitId,
      version: t.version, publishedAt: t.publishedAt, validFrom: t.validFrom,
    })),
    pending: pending.map(p => ({
      id: p.id, kind: p.kind,
      title: lessonTitle(p.kind === 'deleted' ? p.before : p.lesson, ctx),
      diff: p.kind === 'changed' ? diffLabels(p.before, p.lesson, ctx) : [],
    })),
    blockers: blockersOf(s, ctx, pending),
  };
}

/** Опубликовать все черновики зоны. Версия семестра растёт, журнал пишется. */
export async function publish() {
  await tick();
  const s = ensure(), ctx = getCtx();
  const admin = currentAdmin(s);
  if (!admin) throw new ApiError('foreign', 'Войдите как администратор, чтобы публиковать.');
  const scope = (l) => inZone(s, admin, l);
  const pending = pendingOf(s.lessons, scope);
  if (!pending.length) throw new ApiError('invalid', 'Публиковать нечего: все правки уже у студентов.');
  const blockers = blockersOf(s, ctx, pending);
  if (blockers.length) {
    throw new ApiError('conflict', `Сначала решите конфликт: ${blockers[0].title}`, { blockers });
  }

  s.lessons = publishLessons(s.lessons, scope);

  // Версию поднимаем у семестров тех подразделений, где что-то поменялось.
  const at = stamp();
  const units = new Set(pending.map(p => unitIdOfGroup(s, (p.lesson.groupIds || [])[0])));
  for (const t of s.terms.filter(x => units.has(x.unitId))) {
    const before = { version: t.version, publishedAt: t.publishedAt };
    t.version = (t.version || 0) + 1;
    t.publishedAt = at;
    t.status = 'published';
    const mine = pending.filter(p => unitIdOfGroup(s, (p.lesson.groupIds || [])[0]) === t.unitId);
    writeAudit(s, admin, {
      entity: 'Term', entityId: t.id, action: 'publish', before,
      after: { version: t.version, publishedAt: at, count: mine.length, lessons: mine.map(p => ({ id: p.id, kind: p.kind })) },
    });
  }
  commit();
  return { count: pending.length };
}
