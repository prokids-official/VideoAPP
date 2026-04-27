export const LANGUAGE_WHITELIST = new Set([
  'ZH',
  'EN',
  'JA',
  'KO',
  'FR',
  'DE',
  'ES',
  'IT',
  'RU',
  'PT',
  'AR',
  'HI',
  'TH',
  'VI',
  'ID',
  'MS',
]);

export function isValidLanguage(code: string): boolean {
  return /^[A-Z]{2}$/.test(code) && LANGUAGE_WHITELIST.has(code);
}
