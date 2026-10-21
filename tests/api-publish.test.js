/* Черновик → публикация на настоящем сиде. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/data/api.js';
import { ApiError } from '../src/data/errors.js';

const WEEK = '2026-10-21';
beforeEach(async () => { await api.resetDemo(); });

const group = async (code) => (await api.getIndex()).units.flatMap(u => u.groups).find(g => g.code === code);
const studentWeek = async (groupId) => (await api.getWeek({ groupId }, WEEK)).days.flatMap(d => d.lessons);
async function trap() {
  const grid = await api.getGridView({ unitId: 'u-iest', weekFrom: WEEK });
  return grid.cells.find(c => c.published === false && c.date === WEEK && c.slot === 2);
}

test('ловушку опубликовать нельзя: конфликт блокирует и называется', async () => {
  const view = await api.getPublishView();
  assert.equal(view.pending.length, 1);
  assert.equal(view.blockers.length, 1);
  assert.match(view.blockers[0].message, /Ауд\. 133/);
  await assert.rejects(api.publish(), (e) => e instanceof ApiError && e.code === 'conflict' && e.blockers.length === 1);
});

test('пересадили — опубликовали: студенты УЧБИХ-261 видят пару, версия выросла, журнал записал', async () => {
  const cell = await trap();
  const [room] = await api.getRoomOptions(cell.lessonId);
  await api.saveLesson(cell.lessonId, { roomId: room.id });
  const g = await group('УЧБИХ-261');
  assert.ok(!(await studentWeek(g.id)).some(o => o.lessonId === cell.lessonId), 'до публикации не видно');

  const before = (await api.getPublishView()).terms.find(t => t.id === 'term-u-iest').version;
  const { count } = await api.publish();
  assert.equal(count, 1);

  assert.ok((await studentWeek(g.id)).some(o => o.lessonId === cell.lessonId && o.roomId === room.id));
  const view = await api.getPublishView();
  assert.equal(view.pending.length, 0);
  assert.equal(view.terms.find(t => t.id === 'term-u-iest').version, before + 1);
  assert.equal((await trap()), undefined, 'в сетке больше нет черновика');
  const [entry] = await api.getAudit({ limit: 1 });
  assert.equal(entry.action, 'publish');
});

test('правка и удаление опубликованного доходят до студента только после публикации', async () => {
  const cell = await trap();
  await api.deleteLesson(cell.lessonId);   // ловушку убрали, чтобы не мешала
  const g = await group('ГОБЩ-261');
  const [a, b] = (await studentWeek(g.id)).filter(o => o.status === 'ok' && o.subgroup == null && o.room?.kind === 'aud');
  const [room] = await api.getRoomOptions(a.lessonId);
  await api.saveLesson(a.lessonId, { roomId: room.id });
  await api.deleteLesson(b.lessonId);

  const view = await api.getPublishView();
  const changed = view.pending.find(p => p.id === a.lessonId);
  assert.equal(changed.kind, 'changed');
  assert.deepEqual(changed.diff.map(d => d.label), ['Аудитория']);
  assert.equal(view.pending.find(p => p.id === b.lessonId).kind, 'deleted');

  let seen = await studentWeek(g.id);
  assert.equal(seen.find(o => o.lessonId === a.lessonId).roomId, a.roomId);
  assert.ok(seen.some(o => o.lessonId === b.lessonId));

  await api.publish();
  seen = await studentWeek(g.id);
  assert.equal(seen.find(o => o.lessonId === a.lessonId).roomId, room.id);
  assert.ok(!seen.some(o => o.lessonId === b.lessonId));
});

test('публиковать нечего — честный отказ', async () => {
  await api.deleteLesson((await trap()).lessonId);
  await assert.rejects(api.publish(), (e) => e instanceof ApiError && e.code === 'invalid');
});

test('чужие черновики админ не публикует и не видит в списке', async () => {
  await api.setPrefs({ adminId: 'a-ispo' });
  const view = await api.getPublishView();
  assert.equal(view.pending.length, 0, 'ловушка ИЕСТ — не в зоне ИСПО');
  await api.setPrefs({ adminId: 'a-iest' });
});
