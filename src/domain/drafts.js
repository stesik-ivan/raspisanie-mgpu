/* Черновик и опубликованная версия занятия.

   Поля самого занятия — рабочая копия администратора. Пока правки не
   опубликованы, студенты должны видеть старую версию, поэтому при первой
   правке опубликованного занятия его снимок кладётся в `pub`:

     published: true              — правок нет, студент видит само занятие;
     published: false, pub: {…}   — есть правки, студент видит pub;
     published: false, без pub    — новое занятие, студент не видит ничего.

   Хранить снимок в самом занятии, а не отдельной коллекцией, проще для
   демо и для будущего PocketBase: одна запись — одно занятие. */

/** Поля, из которых состоит смысл занятия. Всё остальное служебное. */
export const LESSON_FIELDS = ['disciplineId', 'kind', 'groupIds', 'subgroup',
  'teacherIds', 'roomId', 'weekday', 'slot', 'dateRule'];

const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

function snapshot(lesson) {
  const { pub, published, deleted, ...rest } = lesson;
  return structuredClone(rest);
}

/**
 * Правка занятия. Исходник не трогает.
 * @param {object} lesson
 * @param {object} patch только смысловые поля, служебные игнорируются
 * @param {string} at момент правки, 'YYYY-MM-DDTHH:MM'
 */
export function editLesson(lesson, patch, at) {
  const changes = {};
  for (const f of LESSON_FIELDS) {
    if (patch && f in patch) changes[f] = structuredClone(patch[f]);
  }
  if (LESSON_FIELDS.every(f => !(f in changes) || same(changes[f], lesson[f]))) {
    return structuredClone(lesson);
  }

  const next = { ...structuredClone(lesson), ...changes, version: (lesson.version || 0) + 1, updatedAt: at };

  if (lesson.published !== false) {
    next.published = false;
    next.pub = snapshot(lesson);
  }
  // Правками вернули ровно опубликованное — правок больше нет.
  if (next.pub && LESSON_FIELDS.every(f => same(next[f], next.pub[f]))) {
    delete next.pub;
    next.published = true;
  }
  return next;
}

/**
 * Что поменялось между двумя версиями — для журнала «было → стало».
 * null с одной стороны — создание или удаление.
 * @returns {{field:string, from:any, to:any}[]}
 */
export function lessonDiff(before, after) {
  return LESSON_FIELDS
    .filter(f => !same(before?.[f], after?.[f]))
    .map(f => ({ field: f, from: before?.[f] ?? null, to: after?.[f] ?? null }));
}
