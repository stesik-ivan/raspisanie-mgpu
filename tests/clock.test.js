import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseNowParam, toIsoDate, toMinutesOfDay } from '../src/data/clock.js';

// Review Focus 4
test('валидный ?now разбирается', () => {
  assert.equal(parseNowParam('2026-10-22T10:45'), '2026-10-22T10:45');
  assert.equal(parseNowParam('2026-10-22T10:45:00'), '2026-10-22T10:45:00');
  assert.equal(parseNowParam('2026-10-22'), '2026-10-22');
});

test('невалидный ?now даёт null — откат на реальное время', () => {
  assert.equal(parseNowParam('вчера'), null);
  assert.equal(parseNowParam('2026-13-45'), null);
  assert.equal(parseNowParam('2026-02-30T10:00'), null);
  assert.equal(parseNowParam(''), null);
  assert.equal(parseNowParam(null), null);
  assert.equal(parseNowParam('10:45'), null);
});

test('toIsoDate не съезжает на сутки в любом поясе', () => {
  assert.equal(toIsoDate(new Date(2026, 9, 22, 0, 5)), '2026-10-22');
  assert.equal(toIsoDate(new Date(2026, 9, 22, 23, 55)), '2026-10-22');
  assert.equal(toIsoDate(new Date(2026, 0, 1, 0, 0)), '2026-01-01');
});

test('toMinutesOfDay считает минуты от местной полуночи', () => {
  assert.equal(toMinutesOfDay(new Date(2026, 9, 22, 10, 45)), 645);
  assert.equal(toMinutesOfDay(new Date(2026, 9, 22, 0, 0)), 0);
  assert.equal(toMinutesOfDay(new Date(2026, 9, 22, 23, 59)), 1439);
});
