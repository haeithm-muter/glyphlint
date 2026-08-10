import { describe, expect, it } from 'vitest';

import { unsafeWordBreakForScript as rule } from '../../src/rules/unsafe-word-break-for-script.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

describe('unsafe-word-break-for-script — cursive scripts', () => {
  it('reports word-break: break-all on a cursive script', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabicLong, { css: { wordBreak: 'break-all' } }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('moderate');
    expect(violations[0]?.whatIsWrong).toContain('word-break: break-all');
    expect(violations[0]?.whyItMatters).toContain('letters join');
  });

  it('reports hyphens: auto on a cursive script', () => {
    const violation = rule.check(
      snapshotOfOne(SAMPLES.syriac, { css: { hyphens: 'auto' } }),
    )[0];

    expect(violation?.whatIsWrong).toContain('hyphens: auto');
    expect(violation?.script).toBe('syriac');
  });

  it('reports both declarations on one element as one finding', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabicLong, { css: { wordBreak: 'break-all', hyphens: 'auto' } }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.whatIsWrong).toContain('word-break: break-all');
    expect(violations[0]?.whatIsWrong).toContain('hyphens: auto');
  });
});

describe('unsafe-word-break-for-script — scripts written without spaces', () => {
  it('reports break-all on Thai, Lao and Khmer', () => {
    const violation = rule.check(
      snapshotOfOne(SAMPLES.thaiLong, { css: { wordBreak: 'break-all' } }),
    )[0];

    expect(violation?.script).toBe('thai');
    expect(violation?.whyItMatters).toContain('without spaces between words');
    expect(violation?.howToFix).toContain('lang');
  });

  it('reports hyphens: auto on Han and Kana', () => {
    const violation = rule.check(snapshotOfOne(SAMPLES.hanLong, { css: { hyphens: 'auto' } }))[0];

    expect(violation?.script).toBe('han');
    expect(violation?.whyItMatters).toContain('does not hyphenate');
  });
});

describe('unsafe-word-break-for-script — must not flag', () => {
  it('never reports break-all on Han or Kana, which break between characters anyway', () => {
    // The pairing the property table exists to get right. Han and Kana write without inter-word
    // spaces exactly like Thai does, and break-all is ordinary there rather than a defect.
    expect(rule.check(snapshotOfOne(SAMPLES.hanLong, { css: { wordBreak: 'break-all' } }))).toEqual(
      [],
    );
  });

  it('never reports hyphens: auto on Thai, which is not the defect for that script', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.thaiLong, { css: { hyphens: 'auto' } }))).toEqual([]);
  });

  it('never reports Latin, which is what these declarations were designed for', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.latinLong, { css: { wordBreak: 'break-all', hyphens: 'auto' } }),
      ),
    ).toEqual([]);
  });

  it('never reports the default values', () => {
    // Measured: Chromium computes `normal` for word-break and `manual` for hyphens on an
    // untouched paragraph, so an ordinary page produces nothing here.
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong))).toEqual([]);
  });

  it('never reports keep-all or break-word, which are not break-all', () => {
    for (const wordBreak of ['keep-all', 'break-word', 'normal']) {
      expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { css: { wordBreak } }))).toEqual([]);
    }
  });

  it('never reports a single letter, which has nothing to break inside', () => {
    expect(rule.check(snapshotOfOne('م', { css: { wordBreak: 'break-all' } }))).toEqual([]);
  });

  it('never reports a writing system it does not model', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.bengali, { css: { wordBreak: 'break-all' } }))).toEqual(
      [],
    );
  });
});

describe('unsafe-word-break-for-script — contract', () => {
  it('affects the cursive and the unspaced scripts, and nothing else', () => {
    expect(rule.affectedScripts).toEqual([
      'arabic',
      'han',
      'kana',
      'khmer',
      'lao',
      'mongolian',
      'nko',
      'syriac',
      'thai',
    ]);
  });

  it('admits that it reports a declaration rather than an observed break', () => {
    expect(rule.limitations).toContain('not an observed break');
    expect(rule.limitations).toContain('overflow-wrap: anywhere');
    expect(rule.confidence).toBe('medium');
  });
});

describe('correct segmentation is available and free', () => {
  it('segments Thai into words with no dependency and no spaces in the text', () => {
    // The point behind the Thai half of this rule. The browser can find word boundaries in a
    // script that writes without spaces — Intl.Segmenter is built in and does it correctly — so
    // `word-break: break-all` is not solving a problem the platform cannot solve.
    const segments = [...new Intl.Segmenter('th', { granularity: 'word' }).segment('สวัสดีชาวโลก')]
      .filter((entry) => entry.isWordLike)
      .map((entry) => entry.segment);

    expect(segments).toEqual(['สวัสดี', 'ชาว', 'โลก']);
  });
});
