import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fuzzySearch, normalizeCode, levenshtein } from '../src/ui/search.js';

const groups = [
  { id: '1', code: 'ГШТ-261' }, { id: '2', code: 'ГОБЩ-261' },
  { id: '3', code: 'УЧБИХ-261' }, { id: '4', code: 'ГА-251' },
  { id: '5', code: 'ФК-241' }, { id: '6', code: 'ФК-242' },
  { id: '7', code: '11СПш-261' }, { id: '8', code: 'НХТфш-251' },
];
const find = (q) => fuzzySearch(groups, q, { keyOf: g => g.code }).map(g => g.code);

test('регистр, пробелы и дефисы не мешают', () => {
  for (const q of ['гшт261', 'ГШТ 261', 'гшт-261', 'ГШТ-261', '  ГШТ−261 ', 'Гшт.261']) {
    assert.deepEqual(find(q), ['ГШТ-261'], `не нашёл по «${q}»`);
  }
});

test('латиница вместо похожей кириллицы находит группу', () => {
  // Проверяем первое место, а не единственность: ФК-241 и ФК-242 отличаются
  // одной цифрой, и показать обе — правильное поведение поиска с опечатками.
  assert.equal(find('ГШT-261')[0], 'ГШТ-261');     // T латинская
  assert.equal(find('ФK-241')[0], 'ФК-241');       // K латинская
  assert.equal(find('ГA-251')[0], 'ГА-251');       // A латинская
  assert.equal(find('HХТфш-251')[0], 'НХТфш-251'); // H латинская
});

test('опечатка в одну букву всё ещё находит', () => {
  assert.ok(find('гшт-262').includes('ГШТ-261'));
  assert.ok(find('гшо-261').includes('ГШТ-261'));
});

test('точное совпадение стоит первым', () => {
  assert.equal(find('фк-241')[0], 'ФК-241');
});

test('префикс находит обе группы серии', () => {
  const r = find('фк');
  assert.ok(r.includes('ФК-241') && r.includes('ФК-242'));
});

test('цифры в начале кода не ломают поиск', () => {
  assert.deepEqual(find('11спш261'), ['11СПш-261']);
  assert.deepEqual(find('спш'), ['11СПш-261']);
});

test('пустой запрос возвращает всё', () => {
  assert.equal(find('').length, groups.length);
  assert.equal(find('   ').length, groups.length);
});

test('бессмыслица не находит ничего', () => {
  assert.deepEqual(find('ЩЩЩЩЩЩЩ'), []);
});

test('normalizeCode приводит к сравнимому виду', () => {
  assert.equal(normalizeCode('ГШТ-261'), normalizeCode('гшт 261'));
  assert.equal(normalizeCode('ГШТ-261'), normalizeCode('ГШT-261'));
  assert.equal(normalizeCode(null), '');
});

test('поиск по ФИО тоже работает с опечаткой', () => {
  const people = [{ id: 'a', fio: 'Абросимова Н.В.' }, { id: 'b', fio: 'Белоусов И.К.' }];
  const r = fuzzySearch(people, 'абросимва', { keyOf: p => p.fio });
  assert.equal(r[0].fio, 'Абросимова Н.В.');
});

test('levenshtein считает правильно', () => {
  assert.equal(levenshtein('кот', 'кот'), 0);
  assert.equal(levenshtein('кот', 'код'), 1);
  assert.equal(levenshtein('', 'кот'), 3);
});
