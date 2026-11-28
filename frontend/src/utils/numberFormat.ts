/**
 * Formattazione numeri all'italiana con il punto delle migliaia SEMPRE presente.
 *
 * Intl con locale it-IT segue la regola CLDR "minimumGroupingDigits = 2":
 * 2889,50 non riceve il punto, 12.889,50 sì. Qui formattiamo senza
 * raggruppamento e inseriamo noi il punto nella parte intera, così
 * anche 1.000–9.999 diventano 1.000, 2.889,50 ecc. su qualsiasi browser.
 */
type Opts = Intl.NumberFormatOptions;

const cache = new Map<string, Intl.NumberFormat>();

const groupInt = (s: string) => s.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

export function itNumberFormat(options: Opts = {}) {
  const key = JSON.stringify(options);
  let nf = cache.get(key);
  if (!nf) {
    nf = new Intl.NumberFormat('it-IT', { ...options, useGrouping: false });
    cache.set(key, nf);
  }
  const f = nf;
  return {
    format: (value: number | bigint) =>
      f.formatToParts(value as number).map((p) => (p.type === 'integer' ? groupInt(p.value) : p.value)).join(''),
  };
}

/** Numero generico (quantità, conteggi, ecc.). */
export const fmtNum = (value: any, options: Opts = {}) => itNumberFormat(options).format(Number(value) || 0);

/** Importo in euro, es. 2.889,50 €. */
export const fmtEur = (value: any, options: Opts = {}) =>
  itNumberFormat({ style: 'currency', currency: 'EUR', ...options }).format(Number(value) || 0);
