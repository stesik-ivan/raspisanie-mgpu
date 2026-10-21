/* Запись через api на настоящем сиде. Хранилища в Node нет — api работает
   в памяти, ровно как в приватном Safari. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/data/api.js';
import { ApiError } from '../src/data/errors.js';

const TRAP_DATE = '2026-10-21';
const IEST = 'u-iest';

async function trapCell() {
  const grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  return grid.cells.find(c => c.published === false && c.date === TRAP_DATE && c.slot === 2);
}

beforeEach(async () => { await api.resetDemo(); });

test('ловушка на месте: черновик в ауд. 133 конфликтует с уроком СПО', async () => {
  const cell = await trapCell();
  assert.ok(cell, 'черновик-ловушка есть в сетке');
  assert.equal(cell.room.name, '133');
  assert.ok(cell.conflicts.some(c => c.level === 'error' && c.type === 'room'));
});

test('предлагаются ровно 212, 234, 346, 143 — как в сценарии показа', async () => {
  const cell = await trapCell();
  const rooms = await api.getRoomOptions(cell.lessonId);
  assert.deepEqual(rooms.map(r => r.name), ['212', '234', '346', '143']);
});

test('замена аудитории снимает конфликт, оставляет черновик и пишет журнал', async () => {
  const cell = await trapCell();
  const [r212] = await api.getRoomOptions(cell.lessonId);
  const { auditId } = await api.saveLesson(cell.lessonId, { roomId: r212.id });

  const after = await trapCell();
  assert.equal(after.room.name, '212');
  assert.deepEqual(after.conflicts.filter(c => c.level === 'error'), []);
  assert.equal(after.published, false, 'правка не публикует');

  const [entry] = await api.getAudit({ limit: 1 });
  assert.equal(entry.id, auditId);
  assert.equal(entry.action, 'update');
  assert.equal(entry.before.roomId, 'r-133');
  assert.equal(entry.after.roomId, r212.id);
});

test('отмена возвращает аудиторию и конфликт, а журнал растёт, а не переписывается', async () => {
  const cell = await trapCell();
  const [r212] = await api.getRoomOptions(cell.lessonId);
  const { auditId } = await api.saveLesson(cell.lessonId, { roomId: r212.id });
  await api.revert(auditId);

  const back = await trapCell();
  assert.equal(back.room.name, '133');
  assert.ok(back.conflicts.some(c => c.level === 'error' && c.type === 'room'));

  const [last, prev] = await api.getAudit({ limit: 2 });
  assert.equal(last.revertOf, auditId);
  assert.equal(prev.id, auditId);
});

test('занятие чужого подразделения править нельзя', async () => {
  const grid = await api.getGridView({ unitId: 'u-ispo', weekFrom: TRAP_DATE });
  const spo = grid.cells[0];
  assert.equal(await api.canEditLesson(spo.lessonId), false);
  await assert.rejects(api.saveLesson(spo.lessonId, { slot: 1 }),
    (e) => e instanceof ApiError && e.code === 'foreign');
});

test('правка по устаревшей версии отклоняется', async () => {
  const cell = await trapCell();
  const [a, b] = await api.getRoomOptions(cell.lessonId);
  await api.saveLesson(cell.lessonId, { roomId: a.id });
  await assert.rejects(api.saveLesson(cell.lessonId, { roomId: b.id }, { version: 1 }),
    (e) => e instanceof ApiError && e.code === 'stale');
});

test('пересадка в занятую аудиторию — ошибка, сохранения нет', async () => {
  const cell = await trapCell();
  const grid = await api.getGridView({ unitId: IEST, weekFrom: TRAP_DATE });
  // Аудитория, где в то же время уже кто-то сидит.
  const busy = grid.cells.find(c => c.date === TRAP_DATE && c.slot === 2 && c.lessonId !== cell.lessonId && c.roomId);
  await assert.rejects(api.saveLesson(cell.lessonId, { roomId: busy.roomId }),
    (e) => e instanceof ApiError && e.code === 'conflict');
  assert.equal((await trapCell()).room.name, '133');
});
