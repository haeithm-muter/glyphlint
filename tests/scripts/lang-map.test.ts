import { describe, expect, it } from 'vitest';

import { expectedScriptsForLanguage } from '../../src/scripts/lang-map.js';

describe('expectedScriptsForLanguage', () => {
  it('maps every language sharing the Arabic script to Arabic', () => {
    // This is the false-positive test the whole map exists for. lang="fa" on Arabic script is
    // correct — Persian is written in the Arabic script — and a tool that calls it a mismatch
    // is worse than a tool that says nothing.
    for (const tag of ['ar', 'fa', 'ur', 'ps', 'ckb', 'sd', 'ug', 'ku']) {
      expect(expectedScriptsForLanguage(tag)).toEqual(['arabic']);
    }
  });

  it('maps the other single-script languages', () => {
    expect(expectedScriptsForLanguage('he')).toEqual(['hebrew']);
    expect(expectedScriptsForLanguage('yi')).toEqual(['hebrew']);
    expect(expectedScriptsForLanguage('hi')).toEqual(['devanagari']);
    expect(expectedScriptsForLanguage('mr')).toEqual(['devanagari']);
    expect(expectedScriptsForLanguage('th')).toEqual(['thai']);
    expect(expectedScriptsForLanguage('lo')).toEqual(['lao']);
    expect(expectedScriptsForLanguage('km')).toEqual(['khmer']);
    expect(expectedScriptsForLanguage('zh')).toEqual(['han']);
    expect(expectedScriptsForLanguage('el')).toEqual(['greek']);
    expect(expectedScriptsForLanguage('dv')).toEqual(['thaana']);
    expect(expectedScriptsForLanguage('vi')).toEqual(['latin']);
    expect(expectedScriptsForLanguage('ru')).toEqual(['cyrillic']);
  });

  it('lists every script for languages that legitimately mix them', () => {
    // Japanese mixes all three inside a single sentence; treating any of them as unexpected
    // would flag correct pages.
    expect(expectedScriptsForLanguage('ja')).toEqual(['han', 'kana', 'latin']);
    expect(expectedScriptsForLanguage('ko')).toEqual(['hangul', 'han']);
    expect(expectedScriptsForLanguage('sr')).toEqual(['cyrillic', 'latin']);
  });

  it('lets an explicit script subtag win over the language table', () => {
    expect(expectedScriptsForLanguage('sr-Latn')).toEqual(['latin']);
    expect(expectedScriptsForLanguage('zh-Hans')).toEqual(['han']);
    expect(expectedScriptsForLanguage('zh-Hant')).toEqual(['han']);
    expect(expectedScriptsForLanguage('uz-Cyrl')).toEqual(['cyrillic']);
    expect(expectedScriptsForLanguage('ku-Arab')).toEqual(['arabic']);
  });

  it('handles the composite ISO 15924 subtags', () => {
    expect(expectedScriptsForLanguage('ja-Jpan')).toEqual(['han', 'kana']);
    expect(expectedScriptsForLanguage('ko-Kore')).toEqual(['hangul', 'han']);
  });

  it('is case-insensitive, as BCP-47 tags are', () => {
    expect(expectedScriptsForLanguage('AR')).toEqual(['arabic']);
    expect(expectedScriptsForLanguage('SR-LATN')).toEqual(['latin']);
    expect(expectedScriptsForLanguage('zh-hans')).toEqual(['han']);
  });

  it('ignores region subtags', () => {
    expect(expectedScriptsForLanguage('en-US')).toEqual(['latin']);
    expect(expectedScriptsForLanguage('ar-EG')).toEqual(['arabic']);
    expect(expectedScriptsForLanguage('pt-BR')).toEqual(['latin']);
  });

  it('does not mistake a variant subtag for a script subtag', () => {
    // Only the position immediately after the language is read. A four-letter subtag further
    // along is a variant or an extension.
    expect(expectedScriptsForLanguage('en-US-fonipa')).toEqual(['latin']);
  });

  it('returns no expectation rather than a guess', () => {
    // An empty array means "we do not know", which downstream must mean "report nothing".
    expect(expectedScriptsForLanguage('sw')).toEqual([]);
    expect(expectedScriptsForLanguage('')).toEqual([]);
    expect(expectedScriptsForLanguage('   ')).toEqual([]);
    expect(expectedScriptsForLanguage(null)).toEqual([]);
    expect(expectedScriptsForLanguage(undefined)).toEqual([]);
  });

  it('does not fall back to the language table when the script subtag is one we do not model', () => {
    // The author said Armenian. Falling back would report Serbian text as expected-Cyrillic
    // and produce a mismatch against a page that is doing nothing wrong.
    expect(expectedScriptsForLanguage('sr-Armn')).toEqual([]);
  });

  it('returns a fresh array the caller cannot use to corrupt the table', () => {
    const first = expectedScriptsForLanguage('ja');
    first.push('cyrillic');
    expect(expectedScriptsForLanguage('ja')).toEqual(['han', 'kana', 'latin']);
  });
});
