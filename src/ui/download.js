/* Отдать файл пользователю: Blob → ссылка с download → клик.
   Ссылку отзываем не сразу: Safari начинает скачивание асинхронно. */

/**
 * @param {string} name имя файла
 * @param {string|Uint8Array} data содержимое
 * @param {string} type MIME-тип
 */
export function download(name, data, type) {
  const blob = new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
