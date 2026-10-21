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
  // Именно переполнение, а не любое слово «storage»: недоступное хранилище
  // в приватном режиме — это не «кончилось место», и так говорить нечестно.
  if (/quota|exceeded|переполн/i.test(m)) return 'На устройстве кончилось место';
  if (/storage|localstorage/i.test(m)) return 'Браузер не разрешает сохранять данные';
  return m || 'Что-то пошло не так';
}
