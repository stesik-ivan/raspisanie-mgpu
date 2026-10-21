/* Поиск с опечатками. Основа — «Полка» (`app.js:774-856`), плюс то, чего
   там не было: нормализация кодов групп.

   Код группы человек набирает как попало: «гшт261», «ГШТ 261», «ГШТ-261».
   Отдельная беда — латиница вместо кириллицы: на телефоне с английской
   раскладки «Т», «К», «А» и ещё десяток букв выглядят точно так же, но это
   разные символы, и обычный поиск молча ничего не находит. */

/** Латиница → кириллица для букв, которые выглядят одинаково. */
const LOOKALIKE = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', K: 'К', M: 'М',
  O: 'О', P: 'Р', T: 'Т', X: 'Х', Y: 'У',
  a: 'а', c: 'с', e: 'е', o: 'о', p: 'р', x: 'х', y: 'у',
};

/** Приводит код или имя к виду, в котором их можно сравнивать. */
export function normalizeCode(s) {
  return String(s ?? '')
    .replace(/[A-Za-z]/g, ch => LOOKALIKE[ch] || ch)
    .toUpperCase()
    .replace(/Ё/g, 'Е')
    // Все виды дефисов и тире, пробелы, точки — в ничто: разделители
    // в кодах групп ставят кто во что горазд.
    .replace(/[\s.\-–—−_/\\]+/g, '')
    .trim();
}

export function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** Допуск опечаток растёт с длиной запроса, но не меньше одной буквы. */
const tolerance = (q) => Math.max(1, Math.round(q.length * 0.34));

/**
 * @param {object[]} items
 * @param {string} query
 * @param {{keyOf:(item:object)=>string, limit?:number}} opts
 */
export function fuzzySearch(items, query, { keyOf, limit = 50 } = {}) {
  const list = items || [];
  const q = normalizeCode(query);
  if (!q) return list.slice(0, limit);

  const scored = [];
  for (const item of list) {
    const raw = keyOf(item);
    const key = normalizeCode(raw);
    const d = distance(q, key, raw);
    if (d <= tolerance(q)) scored.push({ item, d, key });
  }

  return scored
    .sort((a, b) => a.d - b.d || a.key.localeCompare(b.key))
    .slice(0, limit)
    .map(x => x.item);
}

/* 0 — точное совпадение, 0.5 — начинается с запроса, 1 — содержит.
   Дальше считаем расстояние, в том числе по отдельным словам: так
   «абросимва» дотягивается до «Абросимова Н.В.». */
function distance(q, key, raw) {
  if (key === q) return 0;
  if (key.startsWith(q)) return 0.5;
  if (key.includes(q)) return 1;
  const words = String(raw ?? '').split(/[\s.\-–—]+/).map(normalizeCode).filter(Boolean);
  return Math.min(levenshtein(q, key), ...words.map(w => levenshtein(q, w)));
}

/**
 * Подсветка совпадения. Возвращает безопасный HTML.
 * Ищем по нормализованному виду, а подсвечиваем в исходном.
 */
export function highlight(raw, query) {
  const text = String(raw ?? '');
  const q = normalizeCode(query);
  if (!q) return esc(text);

  // Идём по исходной строке, пропуская разделители, и ищем, где
  // нормализованный запрос совпадает подряд.
  let norm = '', map = [];
  for (let i = 0; i < text.length; i++) {
    const n = normalizeCode(text[i]);
    if (n) { norm += n; map.push(i); }
  }
  const at = norm.indexOf(q);
  if (at < 0) return esc(text);

  const from = map[at];
  const to = (map[at + q.length - 1] ?? map.at(-1)) + 1;
  return esc(text.slice(0, from)) + '<mark>' + esc(text.slice(from, to)) + '</mark>' + esc(text.slice(to));
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, ch =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}
