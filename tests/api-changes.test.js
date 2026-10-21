/* Изменения на дату через api: внёс админ — увидел студент, сразу,
   без публикации. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/data/api.js';
import { ApiError } from '../src/data/errors.js';

const WEEK = '2026-10-21';
beforeEach(async () => { await api.resetDemo(); });

async function group(code) {
  return (await api.getIndex()).units.flatMap(u => u.groups).find(g => g.code === code);
}
const studentWeek = async (groupId) => (await api.getWeek({ groupId }, WEEK)).days.flatMap(d => d.lessons);

/** Опубликованная пара ГОБЩ-261 без изменений в неделю показа, не в субботу. */
async function plain() {
  const g = await group('ГОБЩ-261');
  const o = (await studentWeek(g.id)).find(x => x.status === 'ok' && !x.changeIds.length && x.subgroup == null && x.room?.kind === 'aud');
  return { g, o };
}
const find = async (g, o, date = o.date) => (await studentWeek(g.id)).find(x => x.lessonId === o.lessonId && x.date === date);

test('отмена: студент сразу видит «отменено», журнал пишет, отмена правки возвращает', async () => {
  const { g, o } = await plain();
  const { auditId } = await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'cancel', reason: 'болезнь' });
  const seen = await find(g, o);
  assert.equal(seen.status, 'cancelled');
  assert.equal(seen.reason, 'болезнь');
  assert.ok((await api.getChanges({ groupId: g.id }, { fromDate: '2026-10-19' })).some(x => x.lessonId === o.lessonId));
  const [entry] = await api.getAudit({ limit: 1 });
  assert.equal(entry.entity, 'Change');
  await api.revert(auditId);
  assert.equal((await find(g, o)).status, 'ok');
});

test('замена преподавателя: «вместо кого» доходит до студента', async () => {
  const { g, o } = await plain();
  const ctxInfo = await api.getChangeContext(o.lessonId, o.date);
  // Свободный в это время преподаватель: перебираем, пока проверка не пустит.
  let sub = null;
  for (const t of ctxInfo.refs.teachers.filter(t => !o.teacherIds.includes(t.id))) {
    const r = await api.checkChangeDraft({ lessonId: o.lessonId, date: o.date, type: 'teacher', patch: { teacherIds: [t.id] } });
    if (!r.problems.length && !r.conflicts.some(c => c.level === 'error')) { sub = t; break; }
  }
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'teacher', patch: { teacherIds: [sub.id] } });
  const seen = await find(g, o);
  assert.deepEqual(seen.teacherIds, [sub.id]);
  assert.deepEqual(seen.replacedTeachers.map(t => t.id), o.teacherIds);
});

test('смена аудитории: на занятую — ошибка, на предложенную — студент видит «вместо»', async () => {
  const { g, o } = await plain();
  const grid = await api.getGridView({ unitId: 'u-iest', weekFrom: WEEK });
  const busy = grid.cells.find(c => c.date === o.date && c.start === o.start && c.roomId !== o.roomId && c.room?.kind !== 'online');
  await assert.rejects(api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'room', patch: { roomId: busy.roomId } }),
    (e) => e instanceof ApiError && e.code === 'conflict');

  const r = await api.checkChangeDraft({ lessonId: o.lessonId, date: o.date, type: 'room', patch: { roomId: busy.roomId } });
  assert.ok(r.freeRooms.length, 'есть куда пересесть');
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'room', patch: { roomId: r.freeRooms[0].id } });
  const seen = await find(g, o);
  assert.equal(seen.roomId, r.freeRooms[0].id);
  assert.equal(seen.replacedRoomLabel, o.roomLabel);
});

test('перенос: на занятое время группы — ошибка; на субботу — студент видит в новом дне', async () => {
  const { g, o } = await plain();
  const other = (await studentWeek(g.id)).find(x => x.lessonId !== o.lessonId && x.status === 'ok' && x.subgroup == null);
  await assert.rejects(api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'move', patch: { date: other.date, slot: other.slot } }),
    (e) => e instanceof ApiError && e.code === 'conflict');

  const sat = '2026-10-24';
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'move', patch: { date: sat, slot: 1 } });
  const moved = await find(g, o, sat);
  assert.ok(moved?.moved);
  assert.equal(moved.movedFrom.date, o.date);
  assert.ok(!(await find(g, o)), 'в старом дне пары больше нет');
});

test('второе изменение того же типа заменяет первое', async () => {
  const { o } = await plain();
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'cancel', reason: 'раз' });
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'cancel', reason: 'два' });
  const ctx = await api.getChangeContext(o.lessonId, o.date);
  assert.equal(ctx.changes.length, 1);
  assert.equal(ctx.changes[0].reason, 'два');
});

test('снять изменение и отменить снятие', async () => {
  const { g, o } = await plain();
  const { change } = await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'cancel' });
  const { auditId } = await api.deleteChange(change.id);
  assert.equal((await find(g, o)).status, 'ok');
  await api.revert(auditId);
  assert.equal((await find(g, o)).status, 'cancelled');
});

test('изменение в чужом подразделении — отказ', async () => {
  const g = await group('11СПш-261');
  const o = (await studentWeek(g.id)).find(x => x.status === 'ok');
  const ctx = await api.getChangeContext(o.lessonId, o.date);
  assert.equal(ctx.canEdit, false);
  await assert.rejects(api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'cancel' }),
    (e) => e instanceof ApiError && e.code === 'foreign');
});

/* Заменяющий преподаватель должен видеть пару, которую заменяет, а
   заменённый — не видеть. Иначе в сцене 1 у 11СПш-261 «Замена: Тихонов»,
   а у самого Тихонова в «Моих парах» этой пары нет. */
test('замена на дату видна заменяющему и пропадает у заменённого', async () => {
  const { o } = await plain();
  const ctx = await api.getChangeContext(o.lessonId, o.date);
  let sub = null;
  for (const t of ctx.refs.teachers.filter(t => !o.teacherIds.includes(t.id))) {
    const r = await api.checkChangeDraft({ lessonId: o.lessonId, date: o.date, type: 'teacher', patch: { teacherIds: [t.id] } });
    if (!r.problems.length && !r.conflicts.some(c => c.level === 'error')) { sub = t; break; }
  }
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'teacher', patch: { teacherIds: [sub.id] } });

  const mine = (await api.getDay({ teacherId: sub.id }, o.date)).lessons;
  assert.ok(mine.some(x => x.lessonId === o.lessonId), 'заменяющий видит пару');
  const was = (await api.getDay({ teacherId: o.teacherIds[0] }, o.date)).lessons;
  assert.ok(!was.some(x => x.lessonId === o.lessonId), 'у заменённого пары нет');
});
