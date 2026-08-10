/**
 * What writing system a `lang` attribute leads you to expect.
 *
 * A naive `lang -> script` map is the single biggest false-positive generator in this project.
 * `lang="fa"` on Arabic script is correct: Persian is written in the Arabic script, and a tool
 * that reports it as a mismatch is worse than a tool that says nothing. Every entry below is a
 * language-to-script fact, never a language-to-country or language-to-font guess.
 *
 * The map is deliberately incomplete. An unknown tag returns no expectation at all, which
 * downstream means "do not report anything" — silence is the correct answer when we do not know.
 */

import type { ScriptId } from '../types.js';

/**
 * Language subtag to the scripts it is normally written in.
 *
 * Several languages legitimately use more than one: Japanese mixes Han, kana and Latin in a
 * single sentence, Korean mixes Hangul and Han, and Serbian is written in both Cyrillic and
 * Latin. Listing all of them is what keeps the mismatch rule honest.
 */
export const EXPECTED_SCRIPTS_BY_LANGUAGE: Readonly<Record<string, readonly ScriptId[]>> = {
  // Arabic script. Persian, Urdu, Pashto, Sorani Kurdish, Sindhi and Uyghur are different
  // languages sharing one script — this row is the reason the map exists.
  ar: ['arabic'],
  fa: ['arabic'],
  ur: ['arabic'],
  ps: ['arabic'],
  ckb: ['arabic'],
  sd: ['arabic'],
  ug: ['arabic'],
  ku: ['arabic'],

  he: ['hebrew'],
  yi: ['hebrew'],

  hi: ['devanagari'],
  mr: ['devanagari'],
  ne: ['devanagari'],
  sa: ['devanagari'],
  bho: ['devanagari'],
  kok: ['devanagari'],

  th: ['thai'],
  lo: ['lao'],
  km: ['khmer'],

  zh: ['han'],
  ja: ['han', 'kana', 'latin'],
  ko: ['hangul', 'han'],

  vi: ['latin'],
  en: ['latin'],
  fr: ['latin'],
  de: ['latin'],
  es: ['latin'],
  pt: ['latin'],
  id: ['latin'],
  tr: ['latin'],

  ru: ['cyrillic'],
  uk: ['cyrillic'],
  bg: ['cyrillic'],
  sr: ['cyrillic', 'latin'],
  mk: ['cyrillic'],

  el: ['greek'],
  dv: ['thaana'],
};

/**
 * ISO 15924 script subtags, lowercased, mapped to the writing systems we model.
 *
 * The composite codes are part of the standard, not our invention: `Jpan` is defined as Han +
 * Hiragana + Katakana, `Kore` as Hangul + Han, and `Hrkt` as the two Japanese syllabaries.
 * Subtags for scripts GlyphLint does not model are simply absent.
 */
export const SCRIPTS_BY_SUBTAG: Readonly<Record<string, readonly ScriptId[]>> = {
  latn: ['latin'],
  arab: ['arabic'],
  hebr: ['hebrew'],
  syrc: ['syriac'],
  thaa: ['thaana'],
  nkoo: ['nko'],
  deva: ['devanagari'],
  thai: ['thai'],
  laoo: ['lao'],
  khmr: ['khmer'],
  mong: ['mongolian'],
  hani: ['han'],
  hans: ['han'],
  hant: ['han'],
  hira: ['kana'],
  kana: ['kana'],
  hrkt: ['kana'],
  jpan: ['han', 'kana'],
  hang: ['hangul'],
  kore: ['hangul', 'han'],
  cyrl: ['cyrillic'],
  grek: ['greek'],
};

/**
 * The scripts a `lang` tag leads us to expect, or an empty array when we have no expectation.
 *
 * An explicit BCP-47 script subtag always wins over the language table: `sr-Latn` is Latin even
 * though Serbian defaults to Cyrillic, and `zh-Hans` is Han regardless of what `zh` alone says.
 * That override is the whole point — the author told us, so we stop guessing.
 *
 * An empty result means "no expectation", not "expected nothing". Callers must treat it as a
 * reason to stay silent rather than a reason to report a mismatch.
 */
export function expectedScriptsForLanguage(langTag: string | null | undefined): ScriptId[] {
  if (langTag === null || langTag === undefined) return [];

  const subtags = langTag.trim().toLowerCase().split('-').filter((part) => part.length > 0);
  const language = subtags[0];
  if (language === undefined) return [];

  // RFC 5646: the script subtag is four alphabetic characters and sits immediately after the
  // language subtag. Only that position is examined — a four-letter subtag further along is a
  // variant or an extension, and reading it as a script is how `en-US-fonipa` becomes a bug.
  const second = subtags[1];
  if (second !== undefined && /^[a-z]{4}$/.test(second)) {
    const fromSubtag = SCRIPTS_BY_SUBTAG[second];
    // A script subtag we do not model still counts as the author having told us. Falling back
    // to the language table here would let `az-Armn` be reported as Latin.
    return fromSubtag === undefined ? [] : [...fromSubtag];
  }

  const fromLanguage = EXPECTED_SCRIPTS_BY_LANGUAGE[language];
  return fromLanguage === undefined ? [] : [...fromLanguage];
}
