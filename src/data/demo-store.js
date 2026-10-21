/* Хранилище демо: сид плюс localStorage.

   Устроено по образцу «Полки» (`app.js:99-157`) с её главным уроком:
   не доверяй прочитанному. В хранилище может лежать что угодно — состояние
   прошлой версии, обрезанный на середине JSON, чужие данные. Любое из этого
   не должно давать белый экран, тем более на телефоне у руководителя.

   Отдельный случай — хранилище, которого нет: приватный режим Safari,
   переполненная память, запрет сайту хранить данные. Тогда работаем на
   состоянии в памяти и поднимаем флаг ephemeral, чтобы интерфейс мог
   честно сказать «выбор не сохранится». */

import { humanError } from './errors.js';

export const STATE_VERSION = 1;
const KEY = 'mgpu-raspisanie-v1';

const ARRAYS = ['units', 'programs', 'groups', 'buildings', 'rooms', 'teachers',
                'disciplines', 'bellSchedules', 'terms', 'lessons', 'changes',
                'audit', 'admins', 'bookings'];

const THEMES = ['auto', 'light', 'dark'];

function emptyState() {
  const s = { version: STATE_VERSION, prefs: defaultPrefs(), ephemeral: false };
  for (const k of ARRAYS) s[k] = [];
  return s;
}

function defaultPrefs() {
  return {
    role: null,        // 'student' | 'teacher' | 'admin'
    unitId: null,
    groupId: null,
    subgroup: null,
    teacherId: null,
    adminId: null,
    theme: 'auto',
    onboarded: false,
  };
}

/**
 * Приводит что угодно к валидному состоянию. Никогда не бросает.
 * Это единственная дверь, через которую данные попадают в приложение.
 */
export function normalizeState(raw) {
  const base = emptyState();

  let obj = raw;
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); }
    catch (err) {
      console.warn('demo-store: в хранилище не JSON, начинаю заново —', humanError(err));
      return base;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return base;

  for (const k of ARRAYS) {
    base[k] = Array.isArray(obj[k])
      ? obj[k].filter(x => x && typeof x === 'object' && typeof x.id === 'string')
      : [];
  }

  const p = (obj.prefs && typeof obj.prefs === 'object' && !Array.isArray(obj.prefs)) ? obj.prefs : {};
  base.prefs = {
    ...defaultPrefs(),
    role: str(p.role),
    unitId: str(p.unitId),
    groupId: str(p.groupId),
    subgroup: str(p.subgroup),
    teacherId: str(p.teacherId),
    adminId: str(p.adminId),
    theme: THEMES.includes(p.theme) ? p.theme : 'auto',
    onboarded: p.onboarded === true,
  };

  // Версию всегда ставим свою: состояние уже приведено к текущей форме,
  // и притворяться чужой версией ему незачем.
  base.version = STATE_VERSION;
  return base;
}

function str(v) { return typeof v === 'string' && v ? v : null; }

/* ---------- доступ к хранилищу ---------- */

let memory = null;        // запасное состояние, когда localStorage недоступен
let storageBroken = false;

function storage() {
  if (storageBroken) return null;
  try {
    const ls = globalThis.localStorage;
    if (!ls) throw new Error('localStorage отсутствует');
    // Проверяем именно запись: в приватном Safari чтение работает, а запись бросает.
    ls.setItem('__mgpu_probe__', '1');
    ls.removeItem('__mgpu_probe__');
    return ls;
  } catch (err) {
    storageBroken = true;
    console.warn('demo-store: хранилище недоступно, работаю в памяти —', humanError(err));
    return null;
  }
}

/** Читает состояние. Всегда возвращает валидный объект. */
export function loadState() {
  const ls = storage();
  if (!ls) {
    if (!memory) memory = { ...emptyState(), ephemeral: true };
    return memory;
  }
  try {
    const s = normalizeState(ls.getItem(KEY));
    s.ephemeral = false;
    return s;
  } catch (err) {
    console.error('demo-store: не прочитал состояние', err);
    return emptyState();
  }
}

/** Пишет состояние. Неудача не роняет приложение, а переводит в память. */
export function saveState(state) {
  const ls = storage();
  if (!ls) { memory = { ...state, ephemeral: true }; return false; }
  try {
    ls.setItem(KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    storageBroken = true;
    memory = { ...state, ephemeral: true };
    console.warn('demo-store: не записал состояние, дальше в памяти —', humanError(err));
    return false;
  }
}

/** Стирает сохранённое. Пересев делает вызывающий. */
export function clearState() {
  memory = null;
  const ls = storage();
  if (!ls) return false;
  try { ls.removeItem(KEY); return true; }
  catch (err) { console.warn('demo-store: не стёр состояние', err); return false; }
}

/** Только для тестов: сбросить память о сломанном хранилище. */
export function resetStorageProbe() { storageBroken = false; memory = null; }
