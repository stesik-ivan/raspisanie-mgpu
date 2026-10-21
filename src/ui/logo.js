/* Логотип МГПУ с учётом темы.

   У логотипа графитовый текст: на тёмном фоне он почти не виден. Для
   тёмной темы в комплекте брендбука есть «инверсная» версия с белым
   текстом. Ставим обе, а показывает нужную CSS (app.css, .logo-light /
   .logo-dark) — и по системной теме, и по выбранной вручную в «Ещё».
   Сам логотип не меняем: только выбираем версию из комплекта. */

const FILES = {
  'ru-1': ['assets/logo/logo-ru-1.svg', 'assets/logo/logo-ru-1-inversed-onblack.svg'],
  'ru-3': ['assets/logo/logo-ru-3.svg', 'assets/logo/logo-ru-3-inversed-onblack.svg'],
};

/**
 * @param {'ru-1'|'ru-3'} kind вариант логотипа
 * @param {{cls?:string, alt?:string, width:number, height:number}} o
 */
export function logo(kind, { cls = '', alt = '', width, height }) {
  const [light, dark] = FILES[kind];
  const attrs = `width="${width}" height="${height}" alt="${alt}"`;
  // Альтернативный текст — только у одной картинки, чтобы скринридер не читал «МГПУ» дважды.
  return `<img class="${cls} logo-light" src="${light}" ${attrs}>`
    + `<img class="${cls} logo-dark" src="${dark}" width="${width}" height="${height}" alt="">`;
}
