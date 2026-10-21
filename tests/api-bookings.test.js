/* Бронь аудитории через api, на демо-времени четверг 22.10, 10:45. */

import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { freezeClockForTests } from '../src/data/clock.js';
import * as api from '../src/data/api.js';
import { ApiError } from '../src/data/errors.js';

freezeClockForTests('2026-10-22T10:45');

async function teacher(fio) {
  const t = (await api.getIndex()).teachers.find(x => x.fio === fio);
  await api.setPrefs({ role: 'teacher', teacherId: t.id });
  return t;
}
const freeNow = async () => (await api.getFreeRoomsNow({})).filter(r => r.kind !== 'online');

beforeEach(async () => { await api.resetDemo(); await teacher('Тихонов Р.М.'); });

test('занял свободную аудиторию — её нет в свободных, она в «моих», в занятости видна бронь', async () => {
  const [room] = await freeNow();
  const end = room.freeUntil || '12:00';
  await api.bookRoom({ roomId: room.id, end });
  assert.ok(!(await freeNow()).some(r => r.id === room.id));
  const mine = await api.getMyBookings();
  assert.equal(mine.length, 1);
  assert.equal(mine[0].end, end);
  const busy = await api.getRoomBusy(room.id, '2026-10-22');
  const b = busy.find(o => o.discipline === 'Бронь');
  assert.ok(b);
  assert.equal(b.teachers[0].fio, 'Тихонов Р.М.');
});

test('чужую бронь занять нельзя, текст называет, кто занял', async () => {
  const [room] = await freeNow();
  await api.bookRoom({ roomId: room.id, end: '11:30' });
  await teacher('Игнатова М.С.');
  await assert.rejects(api.bookRoom({ roomId: room.id, end: '11:15' }),
    (e) => e instanceof ApiError && e.code === 'conflict' && /Тихонов Р\.М\./.test(e.message));
});

test('аудиторию, где идёт пара, занять нельзя', async () => {
  const busy = (await api.getRoomBusy('r-133', '2026-10-22')).find(o => o.start <= '10:45' && o.end > '10:45');
  assert.ok(busy, 'в 133 сейчас пара');
  await assert.rejects(api.bookRoom({ roomId: 'r-133', end: '11:30' }), (e) => e instanceof ApiError && e.code === 'conflict');
});

test('администратор не поставит пару в забронированную аудиторию', async () => {
  const [room] = await freeNow();
  await api.bookRoom({ roomId: room.id, end: '11:50' });
  const refs = await api.getLessonFormRefs('u-iest');
  const r = await api.checkLessonDraft({
    disciplineId: refs.disciplines[0].id, kind: 'лк', groupIds: [refs.groups[0].id], subgroup: null,
    teacherIds: [refs.teachers.find(t => t.fio !== 'Тихонов Р.М.').id], roomId: room.id, weekday: 4, slot: 2,
    dateRule: { parts: [{ type: 'dates', list: ['2026-10-22'] }], except: [] },
  });
  assert.ok(r.conflicts.some(c => c.type === 'room' && /забронировал Тихонов Р\.М\./.test(c.message)));
});

test('освободить может только тот, кто занял', async () => {
  const [room] = await freeNow();
  const { booking } = await api.bookRoom({ roomId: room.id, end: '11:30' });
  await teacher('Игнатова М.С.');
  await assert.rejects(api.cancelBooking(booking.id), (e) => e instanceof ApiError && e.code === 'foreign');
  await teacher('Тихонов Р.М.');
  await api.cancelBooking(booking.id);
  assert.ok((await freeNow()).some(r => r.id === room.id));
});

test('студент занимать не может', async () => {
  await api.setPrefs({ role: 'student' });
  const [room] = await freeNow();
  await assert.rejects(api.bookRoom({ roomId: room.id, end: '11:30' }), (e) => e instanceof ApiError && e.code === 'foreign');
});
