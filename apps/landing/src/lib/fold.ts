/** Folds text for search: case, Arabic alef/taa marbuta/yaa forms and diacritics, so «ادارة»
 *  finds «إدارة». Used at build time (data-search) and in the browser (the query). */
export const fold = (text: string) =>
  text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[ً-ٰٟ]/g, "")
    .replace(/[آأإٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
