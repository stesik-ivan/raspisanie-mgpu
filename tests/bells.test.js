import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMinutes, fromMinutes, slotTime, slotAt } from '../src/domain/bells.js';
import { BELLS_VO, BELLS_SPO } from '../src/domain/fixtures.js';

test('toMinutes и fromMinutes обратимы', () => {
  assert.equal(toMinutes('10:30'), 630);
  assert.equal(toMinutes('09:00'), 540);
  assert.equal(toMinutes('00:00'), 0);
  assert.equal(fromMinutes(630), '10:30');
  assert.equal(fromMinutes(540), '09:00');
  assert.equal(fromMinutes(0), '00:00');
});

test('toMinutes на мусоре даёт null, а не NaN', () => {
  assert.equal(toMinutes('не время'), null);
  assert.equal(toMinutes(''), null);
  assert.equal(toMinutes(null), null);
  assert.equal(toMinutes('25:00'), null);
  assert.equal(toMinutes('10:61'), null);
});

test('ВО: вторая пара — 10:30–11:50', () => {
  assert.deepEqual(slotTime(BELLS_VO, 3, 2), { start: '10:30', end: '11:50' });
  assert.deepEqual(slotTime(BELLS_VO, 3, 1), { start: '09:00', end: '10:20' });
  assert.deepEqual(slotTime(BELLS_VO, 3, 5), { start: '15:40', end: '17:00' });
});

test('ВО: суббота берёт основную сетку, своей у неё нет', () => {
  assert.deepEqual(slotTime(BELLS_VO, 6, 2), { start: '10:30', end: '11:50' });
});

// docs/02, тестовый случай 11
test('суббота СПО берёт byWeekday[6], а не основную сетку', () => {
  assert.deepEqual(slotTime(BELLS_SPO, 6, 5), { start: '12:35', end: '13:20' });
  assert.deepEqual(slotTime(BELLS_SPO, 2, 5), { start: '12:50', end: '13:35' });
  assert.deepEqual(slotTime(BELLS_SPO, 6, 10), { start: '17:00', end: '17:45' });
  assert.deepEqual(slotTime(BELLS_SPO, 2, 10), { start: '17:15', end: '18:00' });
});

// Review Focus 3
test('несуществующий slot даёт null, а не падение', () => {
  assert.equal(slotTime(BELLS_VO, 3, 7), null);
  assert.equal(slotTime(BELLS_VO, 3, 0), null);
  assert.equal(slotTime(BELLS_VO, 3, null), null);
  assert.equal(slotTime(null, 3, 1), null);
});

test('slotAt: внутри пары — in, с остатком до конца', () => {
  const r = slotAt(BELLS_VO, 3, toMinutes('10:45'));
  assert.equal(r.phase, 'in');
  assert.equal(r.slot, 2);
  assert.equal(r.leftMin, 65);
});

test('slotAt: между парами — gap, со следующей парой', () => {
  const r = slotAt(BELLS_VO, 3, toMinutes('12:00'));
  assert.equal(r.phase, 'gap');
  assert.equal(r.next, 3);
  assert.equal(r.leftMin, 40);   // до 12:40
});

test('slotAt: до начала дня и после конца', () => {
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('08:00')).phase, 'before');
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('08:00')).next, 1);
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('23:00')).phase, 'after');
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('23:00')).next, null);
});

test('slotAt на границе: ровно в начало пары — уже внутри, ровно в конец — уже нет', () => {
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('10:30')).phase, 'in');
  assert.equal(slotAt(BELLS_VO, 3, toMinutes('11:50')).phase, 'gap');
});

test('slotAt учитывает субботнюю сетку СПО', () => {
  assert.equal(slotAt(BELLS_SPO, 6, toMinutes('13:00')).slot, 5);
  assert.equal(slotAt(BELLS_SPO, 2, toMinutes('13:00')).phase, 'in');
  assert.equal(slotAt(BELLS_SPO, 2, toMinutes('13:00')).slot, 5);
});

test('slotsOf возвращает сетку дня целиком', async () => {
  const { slotsOf } = await import('../src/domain/bells.js');
  assert.equal(slotsOf(BELLS_SPO, 6).length, 10);
  assert.equal(slotsOf(BELLS_SPO, 6)[4].start, '12:35');
  assert.equal(slotsOf(BELLS_VO, 3).length, 5);
  assert.deepEqual(slotsOf(null, 3), []);
});
