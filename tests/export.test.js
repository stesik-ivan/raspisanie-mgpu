/* Экспорт без зависимостей: CSV для Excel и настоящий .xlsx (zip без сжатия). */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toCsv } from '../src/domain/export-csv.js';
import { buildXlsx, crc32, colName } from '../src/domain/export-xlsx.js';

test('CSV: BOM, точка с запятой, CRLF — Excel в русской Windows открывает сразу', () => {
  const csv = toCsv([['День', 'Пара'], ['пн', '1']]);
  assert.equal(csv, '﻿День;Пара\r\nпн;1\r\n');
});

test('CSV: кавычки, разделитель и перевод строки внутри ячейки экранируются', () => {
  const csv = toCsv([['a;b', 'он сказал "да"', 'две\nстроки', null, 5]]);
  assert.equal(csv, '﻿"a;b";"он сказал ""да""";"две\nстроки";;5\r\n');
});

test('crc32 по эталону', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
  assert.equal(crc32(new Uint8Array()), 0);
});

test('colName: A, Z, AA, AZ', () => {
  assert.deepEqual([0, 25, 26, 51].map(colName), ['A', 'Z', 'AA', 'AZ']);
});

/** Мини-читалка zip: проходит по локальным заголовкам и проверяет CRC. */
function readZip(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let p = 0;
  while (dv.getUint32(p, true) === 0x04034b50) {
    const method = dv.getUint16(p + 8, true);
    const crc = dv.getUint32(p + 14, true);
    const size = dv.getUint32(p + 18, true);
    const nameLen = dv.getUint16(p + 26, true);
    const extraLen = dv.getUint16(p + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 30, p + 30 + nameLen));
    const data = bytes.subarray(p + 30 + nameLen + extraLen, p + 30 + nameLen + extraLen + size);
    assert.equal(method, 0, 'без сжатия');
    assert.equal(crc32(data), crc, `CRC ${name}`);
    files[name] = new TextDecoder().decode(data);
    p += 30 + nameLen + extraLen + size;
  }
  // Центральный каталог и конец архива на месте.
  const eocd = bytes.length - 22;
  assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  assert.equal(dv.getUint16(eocd + 10, true), Object.keys(files).length);
  return files;
}

test('xlsx: валидный zip с обязательными частями книги', () => {
  const bytes = buildXlsx({
    sheetName: 'ГШТ-261', title: 'ГШТ-261, 19–24 окт',
    columns: [{ header: 'День', width: 12 }, { header: 'Дисциплина', width: 30 }],
    rows: [['пн 19.10', 'Геология'], ['вт 20.10', 'Почвоведение & <лаб>']],
  });
  assert.equal(bytes[0], 0x50); assert.equal(bytes[1], 0x4b);
  const files = readZip(bytes);
  for (const f of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels',
    'xl/styles.xml', 'xl/worksheets/sheet1.xml']) assert.ok(files[f], `нет ${f}`);
  const sheet = files['xl/worksheets/sheet1.xml'];
  assert.match(sheet, /Почвоведение &amp; &lt;лаб&gt;/, 'XML экранирован');
  assert.match(sheet, /<mergeCell ref="A1:B1"\/>/, 'заголовок объединён на всю ширину');
  assert.match(files['xl/workbook.xml'], /name="ГШТ-261"/);
});

test('xlsx: имя листа без запрещённых символов и не длиннее 31', () => {
  const files = readZip(buildXlsx({ sheetName: 'a/b\\c?d*e[f]g:' + 'x'.repeat(40), title: 't', columns: [{ header: 'h' }], rows: [] }));
  const name = /name="([^"]*)"/.exec(files['xl/workbook.xml'])[1];
  assert.ok(name.length <= 31);
  assert.ok(!/[\\/?*[\]:]/.test(name));
});
