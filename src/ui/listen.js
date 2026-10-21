/* Обработчик на постоянный контейнер экрана.

   #view живёт всё время работы приложения, а экраны перерисовываются в
   нём заново. Обычный addEventListener при каждой отрисовке добавлял бы
   ещё один обработчик: через три перехода клик срабатывал трижды, а в
   админке это двойная правка. Здесь новый обработчик снимает прежний
   того же типа на том же контейнере. */

const controllers = new WeakMap();

export function listen(host, type, fn) {
  let byType = controllers.get(host);
  if (!byType) { byType = new Map(); controllers.set(host, byType); }
  byType.get(type)?.abort();
  const ac = new AbortController();
  byType.set(type, ac);
  host.addEventListener(type, fn, { signal: ac.signal });
}
