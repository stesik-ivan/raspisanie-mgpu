import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeState, STATE_VERSION } from '../src/data/demo-store.js';

// Review Focus 2
test('normalizeState достраивает мусор до валидного состояния', () => {
  for (const junk of [null, undefined, '', 0, 'строка', '{обрезанный json', [], 42, true]) {
    const s = normalizeState(junk);
    assert.equal(s.version, STATE_VERSION, `не выжило: ${JSON.stringify(junk)}`);
    assert.ok(Array.isArray(s.lessons));
    assert.ok(Array.isArray(s.groups));
    assert.ok(Array.isArray(s.changes));
    assert.ok(s.prefs && typeof s.prefs === 'object');
  }
});

test('нужные массивы остаются массивами, даже если пришли не тем', () => {
  const s = normalizeState({ groups: 'не массив', lessons: { a: 1 }, changes: null, rooms: 5 });
  assert.deepEqual(s.groups, []);
  assert.deepEqual(s.lessons, []);
  assert.deepEqual(s.changes, []);
  assert.deepEqual(s.rooms, []);
});

test('нормализация не выбрасывает годные данные', () => {
  const s = normalizeState({
    version: STATE_VERSION,
    groups: [{ id: 'g1', code: 'ГШТ-261' }],
    prefs: { groupId: 'g1', subgroup: '2', theme: 'dark' },
  });
  assert.equal(s.groups.length, 1);
  assert.equal(s.prefs.groupId, 'g1');
  assert.equal(s.prefs.subgroup, '2');
  assert.equal(s.prefs.theme, 'dark');
});

test('битые элементы массивов выбрасываются, целые остаются', () => {
  const s = normalizeState({ groups: [{ id: 'g1' }, null, 'мусор', { code: 'без id' }, { id: 'g2' }] });
  assert.deepEqual(s.groups.map(g => g.id), ['g1', 'g2']);
});

test('незнакомая тема откатывается на авто', () => {
  assert.equal(normalizeState({ prefs: { theme: 'радуга' } }).prefs.theme, 'auto');
  assert.equal(normalizeState({ prefs: { theme: 'dark' } }).prefs.theme, 'dark');
});

test('состояние старой версии не притворяется свежим', () => {
  const s = normalizeState({ version: 0, groups: [{ id: 'g1' }] });
  assert.equal(s.version, STATE_VERSION);
});
