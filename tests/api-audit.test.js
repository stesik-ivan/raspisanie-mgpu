/* Журнал словами: кто, что, «было → стало». */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/data/api.js';

const WEEK = '2026-10-21';
beforeEach(async () => { await api.resetDemo(); });

async function trap() {
  const grid = await api.getGridView({ unitId: 'u-iest', weekFrom: WEEK });
  return grid.cells.find(c => c.published === false && c.date === WEEK && c.slot === 2);
}

test('пересадка: в журнале название занятия и «Аудитория: Ауд. 133 → Ауд. 212»', async () => {
  const cell = await trap();
  const [room] = await api.getRoomOptions(cell.lessonId);
  await api.saveLesson(cell.lessonId, { roomId: room.id });
  const [e] = await api.getAudit({ limit: 1 });
  assert.match(e.title, /Анатомия человека/);
  assert.match(e.title, /УЧБИХ-261/);
  assert.deepEqual(e.details, [{ label: 'Аудитория', from: 'Ауд. 133', to: 'Ауд. 212' }]);
  assert.ok(e.groupIds.length, 'есть группы для фильтра');
});

test('отмена правки помечена и показывает обратную разницу', async () => {
  const cell = await trap();
  const [room] = await api.getRoomOptions(cell.lessonId);
  const { auditId } = await api.saveLesson(cell.lessonId, { roomId: room.id });
  await api.revert(auditId);
  const [e] = await api.getAudit({ limit: 1 });
  assert.equal(e.revertOf, auditId);
  assert.deepEqual(e.details, [{ label: 'Аудитория', from: 'Ауд. 212', to: 'Ауд. 133' }]);
});

test('изменение на дату: дата в названии, что именно и причина', async () => {
  const cell = await trap();
  const grid = await api.getGridView({ unitId: 'u-iest', weekFrom: WEEK });
  const o = grid.cells.find(c => c.published && c.status === 'ok' && c.date === WEEK);
  await api.saveChange({ lessonId: o.lessonId, date: o.date, type: 'cancel', reason: 'болезнь' });
  const [e] = await api.getAudit({ limit: 1 });
  assert.match(e.title, /21\.10/);
  assert.deepEqual(e.details, [{ label: 'Отмена', from: '', to: 'болезнь' }]);
  assert.ok(cell);
});

test('публикация: подразделение и версия «3 → 4»', async () => {
  const cell = await trap();
  const [room] = await api.getRoomOptions(cell.lessonId);
  await api.saveLesson(cell.lessonId, { roomId: room.id });
  await api.publish();
  const [e] = await api.getAudit({ limit: 1 });
  assert.equal(e.title, 'ИЕСТ');
  assert.deepEqual(e.details, [{ label: 'Версия', from: '3', to: '4' }]);
  assert.match(e.note, /1 правка/);
});

test('записи из сида без «до/после» по-прежнему подписаны', async () => {
  const list = await api.getAudit({ limit: 100 });
  assert.ok(list.filter(e => e.entity === 'Lesson').every(e => e.title));
  assert.ok(list.every(e => Array.isArray(e.details)));
});

/* Пустой столбец «что изменилось» на показе вызвал вопрос «а это что».
   У каждой записи из сида должно быть и название, и суть правки. */
test('каждая запись журнала из сида говорит, о чём она и что изменилось', async () => {
  const list = await api.getAudit({ limit: 100 });
  assert.ok(list.length >= 15);
  for (const e of list) {
    assert.ok(e.title, `нет названия у ${e.id}`);
    assert.ok(e.details.length, `пустое «что изменилось» у ${e.id} (${e.entity} ${e.action})`);
  }
});

test('записи журнала из сида — в зоне своего администратора', async () => {
  const index = await api.getIndex();
  const unitOf = new Map(index.units.flatMap(u => u.groups.map(g => [g.id, u.id])));
  const zones = { 'a-iest': ['u-iest', 'u-ico', 'u-iiya'], 'a-ispo': ['u-ispo'] };
  for (const e of await api.getAudit({ limit: 100 })) {
    for (const g of e.groupIds) assert.ok(zones[e.adminId].includes(unitOf.get(g)), `${e.id}: ${g} не в зоне ${e.adminId}`);
  }
});

test('в журнале сида одно изменение на дату не повторяется', async () => {
  const ids = (await api.getAudit({ limit: 100 })).filter(e => e.entity === 'Change').map(e => e.entityId);
  assert.equal(new Set(ids).size, ids.length);
});
