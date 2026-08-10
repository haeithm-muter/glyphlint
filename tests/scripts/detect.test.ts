import { describe, expect, it } from 'vitest';

import { dominantScript, isVietnameseProfile, scriptRuns } from '../../src/scripts/detect.js';
import type { DetectableScript } from '../../src/types.js';

/**
 * At least three samples per writing system. Typing this as a full `Record` over
 * `DetectableScript` means a script added to the project without tests added here will not
 * compile — the coverage requirement is enforced by the type system, not by discipline.
 */
const SAMPLES: Record<DetectableScript, readonly [string, string, string]> = {
  latin: ['Hello world', 'Bonjour', 'Größe'],
  arabic: ['مرحبا', 'كتاب', 'السلام'],
  hebrew: ['שלום', 'ספר', 'עברית'],
  devanagari: ['नमस्ते', 'हिन्दी', 'भारत'],
  thai: ['สวัสดี', 'ภาษาไทย', 'ขอบคุณ'],
  lao: ['ສະບາຍດີ', 'ພາສາລາວ', 'ຂອບໃຈ'],
  khmer: ['សួស្តី', 'ភាសាខ្មែរ', 'អរគុណ'],
  han: ['中文', '你好', '汉字'],
  kana: ['ひらがな', 'カタカナ', 'こんにちは'],
  hangul: ['한국어', '안녕하세요', '감사합니다'],
  cyrillic: ['Привет', 'Здравствуйте', 'Україна'],
  greek: ['Ελληνικά', 'Γειά', 'Ευχαριστώ'],
  syriac: ['ܫܠܡܐ', 'ܟܬܒܐ', 'ܣܘܪܝܝܐ'],
  nko: ['ߒߞߏ', 'ߊߓߊ', 'ߛߓߊ'],
  thaana: ['ދިވެހި', 'ބަސް', 'ސަލާމް'],
  mongolian: ['ᠮᠣᠩᠭᠣᠯ', 'ᠪᠢᠴᠢᠭ', 'ᠰᠠᠶᠢᠨ'],
};

/*
 * Strings whose exact code points carry the meaning of a test are built from code points
 * rather than typed as literals. Precomposed and decomposed text look identical on screen, so
 * a literal would leave the reader unable to check what is actually being asserted.
 */

/** `cafe` with the e-acute as a single code point: 4 UTF-16 units. */
const CAFE_PRECOMPOSED = `caf${String.fromCodePoint(0x00e9)}`;
/** The same word as e followed by a combining acute: 5 UTF-16 units, one grapheme shorter. */
const CAFE_DECOMPOSED = `cafe${String.fromCodePoint(0x0301)}`;
/** One Latin letter under three stacked marks: a + acute + circumflex + tilde. */
const LATIN_WITH_THREE_MARKS = String.fromCodePoint(0x61, 0x0301, 0x0302, 0x0303);
/** Two Arabic letters, meem and reh. */
const ARABIC_TWO_LETTERS = String.fromCodePoint(0x0645, 0x0631);
/** An Arabic word stretched by a tatweel, U+0640, in the middle. */
const ARABIC_WITH_TATWEEL = String.fromCodePoint(0x0645, 0x0640, 0x0631, 0x062d, 0x0628, 0x0627);

describe('dominantScript', () => {
  for (const [script, samples] of Object.entries(SAMPLES)) {
    it(`detects ${script}`, () => {
      for (const sample of samples) {
        expect(dominantScript(sample)).toBe(script);
      }
    });
  }

  it('returns common when the text carries no letters', () => {
    expect(dominantScript('')).toBe('common');
    expect(dominantScript('   \n\t ')).toBe('common');
    expect(dominantScript('12345')).toBe('common');
    expect(dominantScript('!?.,;:()[]')).toBe('common');
    expect(dominantScript('😀🎉🚀')).toBe('common');
  });

  it('returns unknown for letters from a script the table does not model', () => {
    // Bengali. Roughly 26,000 Unicode letters land here; reporting them as `common` would
    // claim a Bengali page contains no writing system at all.
    expect(dominantScript('বাংলা')).toBe('unknown');
  });

  it('ignores digits, including digits that carry a script', () => {
    // Latin digits next to Arabic text must not dilute the Arabic count.
    expect(dominantScript('مرحبا 2024')).toBe('arabic');
    // The Arabic-Indic digits are the trap: U+0660-U+0669 match both Arabic and Thaana under
    // Script_Extensions. They are not letters, so they are not counted at all.
    expect(dominantScript('٢٠٢٤')).toBe('common');
    expect(dominantScript('۱۲۳')).toBe('common');
  });

  it('ignores shared punctuation that resolves to a script', () => {
    // The Devanagari danda is shared across Indic scripts, and it is punctuation, not a letter.
    expect(dominantScript('।')).toBe('common');
  });

  it('counts graphemes, not code points, so combining marks cannot inflate a script', () => {
    // One Latin letter under three marks, against two Arabic letters. Counted per code point
    // the Latin side wins 4-2, because those marks match Latin under Script_Extensions.
    // Counted per grapheme it is 1-2 and Arabic wins, which is the correct answer.
    expect(dominantScript(LATIN_WITH_THREE_MARKS + ARABIC_TWO_LETTERS)).toBe('arabic');
  });

  it('gives the same answer for precomposed and decomposed text', () => {
    expect(CAFE_PRECOMPOSED.length).toBe(4);
    expect(CAFE_DECOMPOSED.length).toBe(5);
    expect(dominantScript(CAFE_PRECOMPOSED)).toBe('latin');
    expect(dominantScript(CAFE_DECOMPOSED)).toBe('latin');
  });

  it('picks the majority script in mixed text', () => {
    expect(dominantScript('Hello world مرحبا')).toBe('latin');
    expect(dominantScript('مرحبا بالعالم Hi')).toBe('arabic');
    expect(dominantScript('中文网站测试 Home')).toBe('han');
  });

  it('counts a Latin word in CJK text at its true weight', () => {
    // Three Han characters against seven Latin letters: Latin wins, and that is the honest
    // answer. A Latin brand name inside a Japanese sentence really can outnumber the CJK
    // around it, which is why rules read `scriptRuns` and not only the dominant script.
    expect(dominantScript('日本語とEnglish')).toBe('latin');
    expect(scriptRuns('日本語とEnglish').map((run) => run.script)).toEqual([
      'han',
      'kana',
      'latin',
    ]);
  });

  it('breaks ties by first appearance so the answer is stable', () => {
    expect(dominantScript(`ab${ARABIC_TWO_LETTERS}`)).toBe('latin');
    expect(dominantScript(`${ARABIC_TWO_LETTERS}ab`)).toBe('arabic');
  });

  it('keeps an Arabic word whole across a tatweel', () => {
    // U+0640 is one of exactly four Unicode letters carrying more than one of our scripts
    // (Arabic and Syriac). It sits inside words as a justification stretch, so it resolves to
    // the run already open rather than to `unknown`.
    expect(dominantScript(ARABIC_WITH_TATWEEL)).toBe('arabic');
    expect(scriptRuns(ARABIC_WITH_TATWEEL)).toHaveLength(1);
  });
});

describe('scriptRuns', () => {
  it('returns nothing for an empty string', () => {
    expect(scriptRuns('')).toEqual([]);
  });

  it('splits mixed text into runs, with non-letters forming their own run', () => {
    expect(scriptRuns('Hi مرحبا')).toEqual([
      { script: 'latin', text: 'Hi', length: 2, start: 0 },
      { script: 'common', text: ' ', length: 1, start: 2 },
      { script: 'arabic', text: 'مرحبا', length: 5, start: 3 },
    ]);
  });

  it('keeps a single-script string as one run', () => {
    expect(scriptRuns('Hello')).toEqual([
      { script: 'latin', text: 'Hello', length: 5, start: 0 },
    ]);
  });

  it('keeps a grapheme and its combining marks inside one run', () => {
    expect(scriptRuns(CAFE_DECOMPOSED)).toEqual([
      { script: 'latin', text: CAFE_DECOMPOSED, length: 5, start: 0 },
    ]);
  });

  it('reproduces the input exactly when the runs are concatenated', () => {
    const inputs = [
      'Hello world مرحبا 2024',
      'สวัสดีครับ Hello',
      '日本語とEnglishと한국어',
      `${CAFE_DECOMPOSED} 😀`,
      LATIN_WITH_THREE_MARKS + ARABIC_TWO_LETTERS,
      'বাংলা',
    ];
    for (const input of inputs) {
      expect(scriptRuns(input).map((run) => run.text).join('')).toBe(input);
    }
  });

  it('reports offsets that slice back to the run text', () => {
    const input = 'Hello world مرحبا 2024';
    for (const run of scriptRuns(input)) {
      expect(input.slice(run.start, run.start + run.length)).toBe(run.text);
    }
  });
});

describe('isVietnameseProfile', () => {
  it('recognises the stacked-diacritic letters Vietnamese does not share', () => {
    expect(isVietnameseProfile('Tiếng Việt')).toBe(true);
    expect(isVietnameseProfile('Chào bạn')).toBe(true);
    expect(isVietnameseProfile('đường')).toBe(true);
  });

  it('does not fire on other Latin-script languages', () => {
    expect(isVietnameseProfile('Hello world')).toBe(false);
    expect(isVietnameseProfile('Sprachgefühl')).toBe(false);
    expect(isVietnameseProfile('Cómo estás')).toBe(false);
  });

  it('does not fire on non-Latin text', () => {
    expect(isVietnameseProfile('مرحبا')).toBe(false);
    expect(isVietnameseProfile('สวัสดี')).toBe(false);
    expect(isVietnameseProfile('')).toBe(false);
  });

  it('is a flag on Latin, not a script of its own', () => {
    // The rules will pair the two: dominantScript(text) === 'latin' && isVietnameseProfile(text).
    expect(dominantScript('Tiếng Việt')).toBe('latin');
  });
});
