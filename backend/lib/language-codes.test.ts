import { describe, expect, it } from 'vitest';
import { LANGUAGE_WHITELIST, isValidLanguage } from './language-codes';

describe('LANGUAGE_WHITELIST', () => {
  it('contains the 16 P0 languages', () => {
    expect(LANGUAGE_WHITELIST.size).toBe(16);

    for (const code of [
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
    ]) {
      expect(LANGUAGE_WHITELIST.has(code)).toBe(true);
    }
  });
});

describe('isValidLanguage', () => {
  it('accepts whitelisted codes', () => {
    expect(isValidLanguage('ZH')).toBe(true);
  });

  it('rejects unknown codes', () => {
    expect(isValidLanguage('XX')).toBe(false);
  });

  it('rejects lowercase / wrong format', () => {
    expect(isValidLanguage('zh')).toBe(false);
    expect(isValidLanguage('ZHO')).toBe(false);
    expect(isValidLanguage('')).toBe(false);
  });
});
