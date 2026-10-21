import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lessonOccurrences, applyChanges } from '../src/domain/occurrences.js';
import { BELLS_VO, BELLS_SPO, TERM } from '../src/domain/fixtures.js';

const ctx = {
  ...TERM,
  bellScheduleOf: (groupId) => String(groupId).startsWith('spo') ? BELLS_SPO : BELLS_VO,
};

const lesson = (over = {}) => ({
  id: 'L1', termId: 'T1', disciplineId: 'D1', kind: 'лк',
  groupIds: ['vo-g1'], subgroup: null, teacherIds: ['T-ivanova'], roomId: 'r304',
  weekday: 3, slot: 2,
  dateRule: { parts: [{ type: 'dates', list: ['2026-10-07', '2026-10-14', '2026-10-21'] }], except: [] },
  ...over,
});

test('вхождения строятся на каждую дату со временем из сетки первой группы', () => {
  const { occurrences, warnings } = lessonOccurrences(lesson(), ctx);
  assert.equal(occurrences.length, 3);
  assert.deepEqual(warnings, []);
  assert.equal(occurrences[0].date, '2026-10-07');
  assert.equal(occurrences[0].start, '10:30');
  assert.equal(occurrences[0].end, '11:50');
  assert.equal(occurrences[0].slot, 2);
  assert.equal(occurrences[0].status, 'ok');
  assert.equal(occurrences[0].lessonId, 'L1');
  assert.deepEqual(occurrences[0].teacherIds, ['T-ivanova']);
});

test('группа СПО берёт свою сетку, а в субботу — субботнюю', () => {
  const { occurrences } = lessonOccurrences(lesson({
    groupIds: ['spo-g1'], weekday: 6, slot: 5,
    dateRule: { parts: [{ type: 'dates', list: ['2026-10-24'] }], except: [] },
  }), ctx);
  assert.equal(occurrences[0].start, '12:35');
  assert.equal(occurrences[0].end, '13:20');
});

// Review Focus 3
test('занятие с несуществующим slot не даёт вхождений и предупреждает', () => {
  const { occurrences, warnings } = lessonOccurrences(lesson({ slot: 7 }), ctx);
  assert.deepEqual(occurrences, []);
  assert.equal(warnings.length, 1);
});

// Review Focus 5
test('занятие без дат даёт ноль вхождений без падения', () => {
  const { occurrences } = lessonOccurrences(lesson({
    dateRule: { parts: [], except: [] },
  }), ctx);
  assert.deepEqual(occurrences, []);
});

test('поток из групп разных подразделений предупреждает о расхождении сеток', () => {
  const { warnings } = lessonOccurrences(lesson({ groupIds: ['vo-g1', 'spo-g1'] }), ctx);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /сетк/i);
});

// --- изменения ---

const base = () => lessonOccurrences(lesson(), ctx).occurrences;

// docs/02, тестовый случай 10, первая половина
test('отмена на дату ставит status cancelled, вхождение остаётся', () => {
  const out = applyChanges(base(), [
    { id: 'C1', date: '2026-10-14', lessonId: 'L1', type: 'cancel', reason: 'актированный день' },
  ], ctx);
  assert.equal(out.length, 3);
  const hit = out.find(o => o.date === '2026-10-14');
  assert.equal(hit.status, 'cancelled');
  assert.deepEqual(hit.changeIds, ['C1']);
  assert.equal(out.find(o => o.date === '2026-10-07').status, 'ok');
});

test('перенос двигает дату и пару и пересчитывает время', () => {
  const out = applyChanges(base(), [
    { id: 'C2', date: '2026-10-14', lessonId: 'L1', type: 'move', patch: { date: '2026-10-16', slot: 4 } },
  ], ctx);
  const moved = out.find(o => o.changeIds.includes('C2'));
  assert.equal(moved.date, '2026-10-16');
  assert.equal(moved.slot, 4);
  assert.equal(moved.start, '14:10');
  assert.equal(moved.end, '15:30');
  assert.ok(!out.some(o => o.date === '2026-10-14'));
});

test('перенос в субботу у группы СПО берёт субботнюю сетку', () => {
  const spo = lessonOccurrences(lesson({
    groupIds: ['spo-g1'], slot: 5,
    dateRule: { parts: [{ type: 'dates', list: ['2026-10-21'] }], except: [] },
  }), ctx).occurrences;
  const out = applyChanges(spo, [
    { id: 'C3', date: '2026-10-21', lessonId: 'L1', type: 'move', patch: { date: '2026-10-24' } },
  ], ctx);
  assert.equal(out[0].start, '12:35');
});

test('замена преподавателя патчит teacherIds, не трогая остальное', () => {
  const out = applyChanges(base(), [
    { id: 'C4', date: '2026-10-07', lessonId: 'L1', type: 'teacher',
      patch: { teacherIds: ['T-petrov'] }, reason: 'больничный' },
  ], ctx);
  const hit = out.find(o => o.date === '2026-10-07');
  assert.deepEqual(hit.teacherIds, ['T-petrov']);
  assert.equal(hit.roomId, 'r304');
  assert.equal(hit.status, 'ok');
});

test('смена аудитории патчит roomId', () => {
  const out = applyChanges(base(), [
    { id: 'C5', date: '2026-10-07', lessonId: 'L1', type: 'room', patch: { roomId: 'r215' } },
  ], ctx);
  assert.equal(out.find(o => o.date === '2026-10-07').roomId, 'r215');
});

test('extra добавляет вхождение, которого не было', () => {
  const out = applyChanges(base(), [
    { id: 'C6', date: '2026-10-28', lessonId: null, type: 'extra',
      patch: { disciplineId: 'D9', kind: 'конс', groupIds: ['vo-g1'], subgroup: null,
               teacherIds: ['T-ivanova'], roomId: 'r212', slot: 3, weekday: 3 } },
  ], ctx);
  assert.equal(out.length, 4);
  const add = out.find(o => o.date === '2026-10-28');
  assert.equal(add.start, '12:40');
  assert.equal(add.slot, 3);
  assert.deepEqual(add.changeIds, ['C6']);
});

test('отменённое вхождение не двигается переносом', () => {
  const out = applyChanges(base(), [
    { id: 'C7', date: '2026-10-14', lessonId: 'L1', type: 'cancel' },
    { id: 'C8', date: '2026-10-14', lessonId: 'L1', type: 'move', patch: { date: '2026-10-16' } },
  ], ctx);
  assert.equal(out.find(o => o.date === '2026-10-14').status, 'cancelled');
  assert.ok(!out.some(o => o.date === '2026-10-16'));
});

test('изменение на дату, которой нет в занятии, игнорируется', () => {
  const out = applyChanges(base(), [
    { id: 'C9', date: '2026-11-11', lessonId: 'L1', type: 'cancel' },
  ], ctx);
  assert.equal(out.length, 3);
  assert.ok(out.every(o => o.status === 'ok'));
});

test('изменение по чужому занятию не трогает наше', () => {
  const out = applyChanges(base(), [
    { id: 'C10', date: '2026-10-07', lessonId: 'L-другое', type: 'cancel' },
  ], ctx);
  assert.ok(out.every(o => o.status === 'ok'));
});

test('замена преподавателя запоминает, кого заменили', () => {
  const out = applyChanges(base(), [
    { id: 'C11', date: '2026-10-07', lessonId: 'L1', type: 'teacher',
      patch: { teacherIds: ['T-petrov'] }, reason: 'больничный' },
  ], ctx);
  const hit = out.find(o => o.date === '2026-10-07');
  assert.deepEqual(hit.replacedTeacherIds, ['T-ivanova']);
  assert.deepEqual(hit.teacherIds, ['T-petrov']);
});

/* Студенту мало «Перенесено» и «Изменено»: нужно «с 14.10, 2 пары» и
   «вместо ауд. 304». Поэтому вхождение помнит, что было до изменения. */
test('перенос помнит, откуда перенесли', () => {
  const out = applyChanges(base(), [
    { id: 'C2', date: '2026-10-14', lessonId: 'L1', type: 'move', patch: { date: '2026-10-16', slot: 4 } },
  ], ctx);
  const moved = out.find(o => o.changeIds.includes('C2'));
  assert.deepEqual(moved.movedFrom, { date: '2026-10-14', slot: 2, start: '10:30' });
});

test('смена аудитории помнит прежнюю', () => {
  const out = applyChanges(base(), [
    { id: 'C5', date: '2026-10-07', lessonId: 'L1', type: 'room', patch: { roomId: 'r215' } },
  ], ctx);
  assert.equal(out.find(o => o.date === '2026-10-07').replacedRoomId, 'r304');
});

/* Перенос обрабатывается раньше замен. Замена аудитории и преподавателя
   привязана к исходной дате — после переноса она не должна теряться. */
test('перенос и смена аудитории на одну дату применяются оба', () => {
  const out = applyChanges(base(), [
    { id: 'R', date: '2026-10-14', lessonId: 'L1', type: 'room', patch: { roomId: 'r215' } },
    { id: 'M', date: '2026-10-14', lessonId: 'L1', type: 'move', patch: { date: '2026-10-16', slot: 4 } },
    { id: 'T', date: '2026-10-14', lessonId: 'L1', type: 'teacher', patch: { teacherIds: ['T-petrov'] } },
  ], ctx);
  const hit = out.find(o => o.date === '2026-10-16');
  assert.equal(hit.roomId, 'r215');
  assert.deepEqual(hit.teacherIds, ['T-petrov']);
  assert.deepEqual([...hit.changeIds].sort(), ['M', 'R', 'T']);
});

test('у нескольких изменений на одну дату причины складываются, а не затираются', () => {
  const out = applyChanges(base(), [
    { id: 'R', date: '2026-10-14', lessonId: 'L1', type: 'room', patch: { roomId: 'r215' }, reason: 'ремонт' },
    { id: 'M', date: '2026-10-14', lessonId: 'L1', type: 'move', patch: { date: '2026-10-16', slot: 4 }, reason: 'мероприятие' },
  ], ctx);
  assert.equal(out.find(o => o.date === '2026-10-16').reason, 'мероприятие; ремонт');
});
