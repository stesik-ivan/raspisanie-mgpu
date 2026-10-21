/* Бронь аудитории преподавателем: «занять до 12:40» или «пока свободна». */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bookingOccurrences, bookingEnds, validateBooking } from '../src/domain/bookings.js';
import { findConflicts, freeRooms, checkLesson } from '../src/domain/conflicts.js';

const ctx = {
  rooms: [{ id: 'r304', buildingId: 'ch1', name: '304', kind: 'aud' }, { id: 'r215', buildingId: 'ch1', name: '215', kind: 'aud' }],
  groups: [{ id: 'g1', code: 'ГШТ-261' }],
  buildings: [{ id: 'ch1', code: 'Ч-1' }],
  disciplineName: (id) => ({ D1: 'Геология' })[id] || id,
  teacherName: (id) => ({ t1: 'Тихонов Р.М.' })[id] || id,
};
const booking = { id: 'B1', roomId: 'r304', date: '2026-10-22', start: '10:45', end: '12:40', teacherId: 't1' };

test('бронь превращается в занятость аудитории без групп и преподавателей', () => {
  const [o] = bookingOccurrences([booking]);
  assert.equal(o.roomId, 'r304');
  assert.equal(o.start, '10:45');
  assert.equal(o.end, '12:40');
  assert.deepEqual(o.groupIds, []);
  assert.deepEqual(o.teacherIds, [], 'бронь не даёт конфликта преподавателя — он сам её и занял');
  assert.equal(o.bookedBy, 't1');
});

test('забронированная аудитория не свободна', () => {
  const free = freeRooms(bookingOccurrences([booking]), ctx, { date: '2026-10-22', start: '11:00', end: '11:30' });
  assert.deepEqual(free.map(r => r.id), ['r215']);
});

test('пара в забронированной аудитории — ошибка, текст называет бронь и кто занял', () => {
  const lesson = { lessonId: 'L1', disciplineId: 'D1', kind: 'лк', date: '2026-10-22', start: '10:30', end: '11:50',
    groupIds: ['g1'], subgroup: null, teacherIds: ['t9'], roomId: 'r304', status: 'ok', changeIds: [] };
  const [c] = checkLesson([lesson], bookingOccurrences([booking]), ctx);
  assert.equal(c.level, 'error');
  assert.equal(c.type, 'room');
  assert.match(c.message, /забронировал Тихонов Р\.М\. до 12:40/);
  assert.equal(findConflicts([...bookingOccurrences([booking])], ctx).length, 0);
});

test('bookingEnds: полчасовые отметки, не дальше «пока свободна», последняя — сама граница', () => {
  // 10:45, свободна до 12:40.
  assert.deepEqual(bookingEnds(10 * 60 + 45, 12 * 60 + 40), ['11:30', '12:00', '12:30', '12:40']);
  // Свободна до конца дня — граница 20:00, отметок не больше четырёх плюс «весь день».
  const all = bookingEnds(10 * 60 + 45, null);
  assert.equal(all.at(-1), '20:00');
  assert.ok(all.length <= 5);
  // Меньше получаса до занятости — только до неё.
  assert.deepEqual(bookingEnds(12 * 60 + 20, 12 * 60 + 40), ['12:40']);
  // Уже вечер — занимать нечего.
  assert.deepEqual(bookingEnds(20 * 60 + 5, null), []);
});

test('validateBooking: конец позже начала, время и дата настоящие', () => {
  assert.deepEqual(validateBooking(booking), []);
  assert.ok(validateBooking({ ...booking, end: '10:00' }).length);
  assert.ok(validateBooking({ ...booking, roomId: null }).length);
  assert.ok(validateBooking({ ...booking, date: 'завтра' }).length);
});
