/* CSV для Excel.

   Три детали, без которых Excel в русской Windows покажет кашу:
   BOM в начале (иначе кириллица читается как cp1251), разделитель «;»
   (запятая там — десятичный знак) и CRLF между строками. */

/** @param {any[][]} rows */
export function toCsv(rows) {
  return '﻿' + rows.map(r => r.map(cell).join(';')).join('\r\n') + '\r\n';
}

function cell(v) {
  if (v == null) return '';
  const s = String(v);
  return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
