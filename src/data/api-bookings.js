/* Бронь аудитории преподавателем: занять свободную до нужного времени.

   Занимать может только преподаватель, и только с этой минуты: бронь —
   ответ на «куда сесть с группой прямо сейчас», а не планирование
   (планирует расписание учебная часть). Проверка та же, что у пары:
   аудитория не должна быть занята ни парой (в том числе черновиком),
   ни чужой бронью. */

import { ensure, getCtx, commit, tick } from './session.js';
import { occurrencesOf, withBookings } from './ctx.js';
import { ApiError } from './errors.js';
import { today, nowMinutes, now, toIsoDate } from './clock.js';
import { decorator, roomLabel } from './decorate.js';
import { bookingOccurrences, validateBooking } from '../domain/bookings.js';
import { checkLesson } from '../domain/conflicts.js';
import { fromMinutes } from '../domain/bells.js';

function me(s) {
  const p = s.prefs;
  if (p.role !== 'teacher' || !p.teacherId) {
    throw new ApiError('foreign', 'Занимать аудитории может преподаватель.');
  }
  return p.teacherId;
}

/**
 * Занять аудиторию с этой минуты до end.
 * @param {{roomId:string, end:string}} o
 */
export async function bookRoom({ roomId, end }) {
  await tick();
  const s = ensure(), ctx = getCtx();
  const teacherId = me(s);
  const booking = {
    id: `B-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    roomId, date: today(), start: fromMinutes(nowMinutes()), end, teacherId,
    createdAt: `${toIsoDate(now())}T${fromMinutes(nowMinutes())}`,
  };
  const [problem] = validateBooking(booking);
  if (problem) throw new ApiError('invalid', problem.message);
  if (ctx.roomOf(roomId)?.kind === 'online') throw new ApiError('invalid', 'Онлайн-комнату занимать не нужно.');

  // Тем же механизмом, что пару: бронь как кандидат против всей занятости.
  const busy = withBookings(s, occurrencesOf(s, { includeDraft: true }));
  const [clash] = checkLesson(bookingOccurrences([booking]), busy, ctx).filter(c => c.type === 'room');
  if (clash) {
    const other = clash.b;
    throw new ApiError('conflict', other?.bookedBy
      ? `${roomLabel(ctx.roomOf(roomId))} уже занята до ${other.end}: её забронировал ${ctx.teacherName(other.bookedBy)}.`
      : `${roomLabel(ctx.roomOf(roomId))} занята с ${other?.start}: там пара.`);
  }

  s.bookings.push(booking);
  commit();
  return { booking: structuredClone(booking) };
}

/** Освободить свою бронь. */
export async function cancelBooking(id) {
  await tick();
  const s = ensure();
  const teacherId = me(s);
  const i = s.bookings.findIndex(b => b.id === id);
  if (i < 0) throw new ApiError('missing', 'Брони уже нет.');
  if (s.bookings[i].teacherId !== teacherId) throw new ApiError('foreign', 'Освободить может только тот, кто занял.');
  const [removed] = s.bookings.splice(i, 1);
  commit();
  return { booking: removed };
}

/** Мои брони на сегодня, которые ещё не кончились. */
export async function getMyBookings() {
  await tick();
  const s = ensure(), ctx = getCtx();
  if (s.prefs.role !== 'teacher') return [];
  const m = fromMinutes(nowMinutes());
  const decorate = decorator(s, ctx);
  return s.bookings
    .filter(b => b.teacherId === s.prefs.teacherId && b.date === today() && b.end > m)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map(b => {
      const d = decorate(bookingOccurrences([b])[0]);
      return { id: b.id, roomId: b.roomId, start: b.start, end: b.end, roomLabel: d.roomLabel, building: d.building };
    });
}
