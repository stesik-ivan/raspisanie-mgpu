/* Состояние демо внутри слоя данных.

   Живёт здесь, а не в api.js, потому что api разрезан на чтение (api.js)
   и запись (api-admin.js), и обоим нужно одно и то же состояние. Наружу,
   в экраны, оно не выходит: экраны видят только функции api. */

import { loadState, saveState } from './demo-store.js';
import { buildSeed } from './seed.js';
import { domainCtx } from './ctx.js';
import { today } from './clock.js';

let state = null;
let ctx = null;

/* День показа. Сид привязывает замену к «сегодня», и если открыть демо
   накануне (как советует сценарий), замена уехала бы на 21.10, а на показе
   22.10 «Сегодня» осталось бы без неё. Раньше этой даты не якорим. */
const DEMO_DAY = '2026-10-22';
export const seedDay = () => { const t = today(); return t < DEMO_DAY ? DEMO_DAY : t; };

/** Состояние, при первом обращении — из хранилища или из сида. */
export function ensure() {
  if (state) return state;
  state = loadState();
  if (!state.lessons?.length) {
    state = { ...buildSeed({ today: seedDay() }), prefs: state.prefs, ephemeral: state.ephemeral };
    saveState(state);
  }
  ctx = domainCtx(state);
  return state;
}

/** Контекст домена для текущего состояния. */
export function getCtx() { ensure(); return ctx; }

/** Сохранить правки и пересобрать контекст домена. */
export function commit() {
  ctx = domainCtx(state);
  saveState(state);
}

/** Заменить состояние целиком — для сброса демо. */
export function replaceState(next) {
  state = next;
  commit();
}

export const tick = () => new Promise(r => setTimeout(r, 0));   // сохранить асинхронность контракта
