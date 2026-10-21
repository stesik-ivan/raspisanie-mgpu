/* Изменение на дату: та же проверка конфликтов, что у занятия, но для
   одного вхождения. docs/02, тестовый случай 10, вторая половина. */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkChange, validateChange } from '../src/domain/changes.js';
import { lessonOccurrences } from '../src/domain/occurrences.js';
import { BELLS_VO, TERM } from '../src/domain/fixtures.js';

const ctx = {
  ...TERM,
  bellScheduleOf: () => BELLS_VO,
  rooms: [
    { id: 'r304', buildingId: 'ch1', name: '304', kind: 'aud' },
    { id: 'r215', buildingId: 'ch1', name: '215', kind: 'aud' },
    { id: 'r307', buildingId: 'ch1', name: '307', kind: 'aud' },
  ],
  groups: [{ id: 'g1', code: 'ГШТ-261' }, { id: 'g2', code: 'ГА-251' }],
  buildings: [{ id: 'ch1', code: 'Ч-1' }],
  disciplineName: (id) => ({ D1: 'Геология', D2: 'Картография' })[id] || id,
  teacherName: (id) => id,
};

const lesson = (over) => ({
  id: 'L1', disciplineId: 'D1', kind: 'лк', groupIds: ['g1'], subgroup: null,
  teacherIds: ['t1'], roomId: 'r304', weekday: 3, slot: 2,
  dateRule: { parts: [{ type: 'dates', list: ['2026-10-14', '2026-10-21'] }], except: [] },
  ...over,
});

// L1: ГШТ-261 по средам 2-й парой в 304. L2: ГА-251 в то же время в 215.
// L3: ГШТ-261 в четверг 15.10 3-й парой в 307.
const raw = [
  ...lessonOccurrences(lesson(), ctx).occurrences,
  ...lessonOccurrences(lesson({ id: 'L2', disciplineId: 'D2', groupIds: ['g2'], teacherIds: ['t2'], roomId: 'r215' }), ctx).occurrences,
  ...lessonOccurrences(lesson({ id: 'L3', teacherIds: ['t3'], roomId: 'r307', weekday: 4, slot: 3,
    dateRule: { parts: [{ type: 'dates', list: ['2026-10-15'] }], except: [] } }), ctx).occurrences,
];
const ch = (type, patch = {}, over = {}) => ({ id: 'NEW', lessonId: 'L1', date: '2026-10-14', type, patch, ...over });

test('смена аудитории на занятую в это время — ошибка, текст про соседа', () => {
  const r = checkChange(ch('room', { roomId: 'r215' }), { raw, changes: [] }, ctx);
  const [c] = r.conflicts.filter(x => x.type === 'room');
  assert.equal(c.level, 'error');
  assert.match(c.message, /занята: ГА-251, Картография/);
  assert.equal(r.target.roomId, 'r215');
});

test('смена аудитории на свободную — конфликтов нет', () => {
  assert.deepEqual(checkChange(ch('room', { roomId: 'r307' }), { raw, changes: [] }, ctx).conflicts, []);
});

test('перенос на время, где группа уже занята, — ошибка (docs/02, случай 10)', () => {
  const r = checkChange(ch('move', { date: '2026-10-15', slot: 3 }), { raw, changes: [] }, ctx);
  assert.ok(r.conflicts.some(c => c.level === 'error' && c.type === 'group'));
  assert.equal(r.target.date, '2026-10-15');
});

test('перенос на свободное время — конфликтов нет, время пересчитано', () => {
  const r = checkChange(ch('move', { date: '2026-10-15', slot: 1 }), { raw, changes: [] }, ctx);
  assert.deepEqual(r.conflicts, []);
  assert.equal(r.target.start, '09:00');
});

test('замена на преподавателя, который в это время ведёт другое, — ошибка', () => {
  const r = checkChange(ch('teacher', { teacherIds: ['t2'] }), { raw, changes: [] }, ctx);
  assert.ok(r.conflicts.some(c => c.level === 'error' && c.type === 'teacher'));
});

test('отмена конфликтов не даёт', () => {
  const r = checkChange(ch('cancel'), { raw, changes: [] }, ctx);
  assert.equal(r.target.status, 'cancelled');
  assert.deepEqual(r.conflicts, []);
});

test('новое изменение того же типа на ту же дату заменяет старое, а не складывается', () => {
  const old = { id: 'OLD', lessonId: 'L1', date: '2026-10-14', type: 'room', patch: { roomId: 'r215' } };
  const r = checkChange(ch('room', { roomId: 'r307' }), { raw, changes: [old] }, ctx);
  assert.equal(r.target.roomId, 'r307');
  assert.deepEqual(r.conflicts, []);
});

test('validateChange: чего не хватает для каждого типа', () => {
  const occ = raw.find(o => o.lessonId === 'L1' && o.date === '2026-10-14');
  assert.deepEqual(validateChange(ch('cancel'), occ), []);
  assert.ok(validateChange(ch('teacher', { teacherIds: [] }), occ).length);
  assert.ok(validateChange(ch('teacher', { teacherIds: ['t1'] }), occ).length, 'замена на того же — не замена');
  assert.ok(validateChange(ch('room', { roomId: 'r304' }), occ).length, 'та же аудитория — не смена');
  assert.ok(validateChange(ch('move', { date: '2026-10-14', slot: 2 }), occ).length, 'перенос туда же — не перенос');
  assert.ok(validateChange(ch('move', { date: 'вчера', slot: 2 }), occ).length);
  assert.ok(validateChange(ch('что-то'), occ).length);
  assert.ok(validateChange(ch('cancel'), null).length, 'нет занятия в эту дату');
});
