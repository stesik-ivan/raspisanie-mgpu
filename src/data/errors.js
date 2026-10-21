/* Человеческие сообщения об ошибках. Из «Полки» (`app.js:241-263`),
   без ветвей про GitHub — синхронизации здесь нет. */

export function humanError(e) {
  const m = String((e && e.message) || e || '');
  if (e instanceof TypeError || /failed to fetch|networkerror|load failed/i.test(m)) {
    return typeof navigator !== 'undefined' && !navigator.onLine
      ? 'Нет интернета'
      : 'Сервер не отвечает';
  }
  if (/json/i.test(m)) return 'Пришёл непонятный ответ';
  if (/quota|storage/i.test(m)) return 'На устройстве кончилось место';
  return m || 'Что-то пошло не так';
}
