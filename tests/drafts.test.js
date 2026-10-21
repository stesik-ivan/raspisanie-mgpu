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

import { newLesson, removeLesson, publishedLessons, workingLessons, validateLesson } from '../src/domain/drafts.js';

const fields = () => ({
  disciplineId: 'd1', kind: 'лк', groupIds: ['g1'], subgroup: null, teacherIds: ['t1'],
  roomId: 'r-212', weekday: 3, slot: 2, dateRule: { parts: [{ type: 'range', from: '2026-09-01', to: null, everyWeeks: 1 }], except: [] },
});

test('новое занятие — черновик без опубликованной версии', () => {
  const l = newLesson(fields(), { id: 'N1', termId: 't', at: 'a' });
  assert.equal(l.id, 'N1');
  assert.equal(l.published, false);
  assert.equal(l.pub, undefined);
  assert.equal(l.version, 1);
  assert.equal(l.roomId, 'r-212');
});

test('удаление никогда не публиковавшегося занятия убирает его совсем', () => {
  const l = newLesson(fields(), { id: 'N1', termId: 't', at: 'a' });
  assert.equal(removeLesson(l, 'b'), null);
});

test('удаление опубликованного — черновик удаления, студент до публикации видит старое', () => {
  const d = removeLesson(base(), 'b');
  assert.equal(d.deleted, true);
  assert.equal(d.published, false);
  assert.equal(d.pub.roomId, 'r-133');
  assert.equal(d.version, 2);
});

test('удаление занятия с правками удаляет правки, а снимок остаётся опубликованным', () => {
  const e = editLesson(base(), { roomId: 'r-212' }, 'a');
  const d = removeLesson(e, 'b');
  assert.equal(d.pub.roomId, 'r-133');
});

test('publishedLessons: студент видит опубликованное, а не рабочую копию', () => {
  const clean = { ...base(), id: 'A' };
  const edited = { ...editLesson({ ...base(), id: 'B' }, { roomId: 'r-212' }, 'a') };
  const fresh = newLesson(fields(), { id: 'C', termId: 't', at: 'a' });
  const gone = removeLesson({ ...base(), id: 'D' }, 'a');
  const pub = publishedLessons([clean, edited, fresh, gone]);
  assert.deepEqual(pub.map(l => l.id), ['A', 'B', 'D']);
  assert.equal(pub.find(l => l.id === 'B').roomId, 'r-133');
  assert.ok(pub.every(l => l.published === true && !l.deleted && !l.pub));
});

test('workingLessons: админ видит рабочую копию без удалённых', () => {
  const edited = editLesson({ ...base(), id: 'B' }, { roomId: 'r-212' }, 'a');
  const gone = removeLesson({ ...base(), id: 'D' }, 'a');
  const work = workingLessons([edited, gone]);
  assert.deepEqual(work.map(l => l.id), ['B']);
  assert.equal(work[0].roomId, 'r-212');
});

test('validateLesson называет каждое незаполненное поле', () => {
  assert.deepEqual(validateLesson(fields()), []);
  const empty = validateLesson({ groupIds: [], teacherIds: [], dateRule: { parts: [] } });
  for (const f of ['disciplineId', 'groupIds', 'teacherIds', 'roomId', 'weekday', 'slot', 'dateRule']) {
    assert.ok(empty.some(p => p.field === f), `нет проблемы для ${f}`);
  }
  assert.ok(empty.every(p => typeof p.message === 'string' && p.message));
});

test('тот же состав групп и преподавателей в другом порядке — не правка', () => {
  const l = { ...base(), groupIds: ['g2', 'g1'], teacherIds: ['t1', 't2'] };
  const e = editLesson(l, { groupIds: ['g1', 'g2'], teacherIds: ['t2', 't1'] }, 'a');
  assert.equal(e.published, true);
  assert.equal(e.version, 1);
  assert.deepEqual(e.groupIds, ['g2', 'g1'], 'порядок остаётся прежним: первая группа задаёт сетку звонков');
});

import { publishLessons, pendingOf } from '../src/domain/drafts.js';

/* Публикация: черновики своей зоны становятся тем, что видят студенты.
   Чужие черновики не трогаем — их публикует их администратор. */
test('publishLessons: правки и новые — опубликованы, удалённые — убраны, чужие не тронуты', () => {
  const clean = { ...base(), id: 'A' };
  const edited = editLesson({ ...base(), id: 'B' }, { roomId: 'r-212' }, 'a');
  const fresh = newLesson(fields(), { id: 'C', termId: 't', at: 'a' });
  const gone = removeLesson({ ...base(), id: 'D' }, 'a');
  const foreign = newLesson({ ...fields(), groupIds: ['g-other'] }, { id: 'E', termId: 't', at: 'a' });
  const mine = (l) => l.groupIds.includes('g1');

  const out = publishLessons([clean, edited, fresh, gone, foreign], mine);
  assert.deepEqual(out.map(l => l.id), ['A', 'B', 'C', 'E']);
  const b = out.find(l => l.id === 'B');
  assert.equal(b.published, true);
  assert.equal(b.pub, undefined);
  assert.equal(b.roomId, 'r-212');
  assert.equal(out.find(l => l.id === 'C').published, true);
  assert.equal(out.find(l => l.id === 'E').published, false, 'чужой черновик остался черновиком');
  assert.deepEqual(publishedLessons(out).find(l => l.id === 'B').roomId, 'r-212', 'студент видит новую версию');
});

test('pendingOf: что ждёт публикации и чем оно стало', () => {
  const edited = editLesson({ ...base(), id: 'B' }, { roomId: 'r-212' }, 'a');
  const fresh = newLesson(fields(), { id: 'C', termId: 't', at: 'a' });
  const gone = removeLesson({ ...base(), id: 'D' }, 'a');
  const list = pendingOf([{ ...base(), id: 'A' }, edited, fresh, gone], () => true);
  assert.deepEqual(list.map(p => [p.id, p.kind]), [['B', 'changed'], ['C', 'new'], ['D', 'deleted']]);
  assert.deepEqual(list[0].diff, [{ field: 'roomId', from: 'r-133', to: 'r-212' }]);
});
