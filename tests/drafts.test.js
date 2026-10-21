import { test } from 'node:test';
import assert from 'node:assert/strict';
import { editLesson, lessonDiff } from '../src/domain/drafts.js';

const base = () => ({
  id: 'L1', termId: 't', disciplineId: 'd1', kind: 'лк',
  groupIds: ['g1'], subgroup: null, teacherIds: ['t1'], roomId: 'r-133',
  weekday: 3, slot: 2, dateRule: { parts: [], except: [] },
  published: true, updatedAt: '2026-09-18T12:00', version: 1,
});

test('правка опубликованного занятия делает черновик и помнит опубликованное', () => {
  const l = base();
  const e = editLesson(l, { roomId: 'r-212' }, '2026-10-21T19:00');
  assert.equal(e.roomId, 'r-212');
  assert.equal(e.published, false);
  assert.equal(e.pub.roomId, 'r-133');
  assert.equal(e.version, 2);
  assert.equal(e.updatedAt, '2026-10-21T19:00');
  assert.equal(l.roomId, 'r-133', 'исходник не тронут');
  assert.equal(e.pub.pub, undefined, 'снимок без вложенного снимка');
});

test('вторая правка черновика не затирает опубликованный снимок', () => {
  const e1 = editLesson(base(), { roomId: 'r-212' }, 'a');
  const e2 = editLesson(e1, { slot: 3 }, 'b');
  assert.equal(e2.pub.roomId, 'r-133');
  assert.equal(e2.pub.slot, 2);
  assert.equal(e2.version, 3);
});

test('черновик без опубликованной версии остаётся черновиком без снимка', () => {
  const draft = { ...base(), published: false };
  const e = editLesson(draft, { roomId: 'r-212' }, 'a');
  assert.equal(e.published, false);
  assert.equal(e.pub, undefined);
});

test('если правками вернули всё как было, черновик снова чистый', () => {
  const e1 = editLesson(base(), { roomId: 'r-212' }, 'a');
  const e2 = editLesson(e1, { roomId: 'r-133' }, 'b');
  assert.equal(e2.published, true);
  assert.equal(e2.pub, undefined);
});

test('правка без изменений не плодит черновик', () => {
  const e = editLesson(base(), { roomId: 'r-133' }, 'a');
  assert.equal(e.published, true);
  assert.equal(e.pub, undefined);
});

test('служебные поля из patch не принимаются', () => {
  const e = editLesson(base(), { roomId: 'r-212', id: 'X', published: true, version: 99 }, 'a');
  assert.equal(e.id, 'L1');
  assert.equal(e.published, false);
  assert.equal(e.version, 2);
});

test('lessonDiff показывает только изменённые поля', () => {
  const a = base();
  const b = { ...a, roomId: 'r-212', groupIds: ['g1', 'g2'] };
  assert.deepEqual(lessonDiff(a, b), [
    { field: 'groupIds', from: ['g1'], to: ['g1', 'g2'] },
    { field: 'roomId', from: 'r-133', to: 'r-212' },
  ]);
  assert.deepEqual(lessonDiff(a, { ...a, version: 5, updatedAt: 'x' }), []);
});

test('lessonDiff для создания и удаления', () => {
  const a = base();
  assert.ok(lessonDiff(null, a).every(d => d.from === null));
  assert.ok(lessonDiff(a, null).every(d => d.to === null));
  assert.ok(lessonDiff(null, a).some(d => d.field === 'roomId' && d.to === 'r-133'));
});
