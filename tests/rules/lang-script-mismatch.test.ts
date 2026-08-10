import { describe, expect, it } from 'vitest';

import { langScriptMismatch as rule } from '../../src/rules/lang-script-mismatch.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

describe('lang-script-mismatch — the violating case', () => {
  const violation = rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownLang: 'en' }))[0];

  it('reports Arabic text declared as English', () => {
    expect(violation).toBeDefined();
    expect(violation?.script).toBe('arabic');
    expect(violation?.severity).toBe('serious');
  });

  it('names both the declared language and what was actually found', () => {
    expect(violation?.whatIsWrong).toContain('lang="en"');
    expect(violation?.whatIsWrong).toContain('Latin');
    expect(violation?.whatIsWrong).toContain('Arabic');
  });

  it('explains the consequence in terms of what a listener hears', () => {
    expect(violation?.whyItMatters).toContain('phoneme');
  });

  it('reads the inherited language when the element declares none', () => {
    const inherited = rule.check(snapshotOfOne(SAMPLES.thaiLong, { inheritedLang: 'en' }));
    expect(inherited).toHaveLength(1);
    expect(inherited[0]?.script).toBe('thai');
  });
});

describe('lang-script-mismatch — the languages that only look wrong', () => {
  // This block is the rule. A naive language-to-script map reports every one of these, and each
  // one of them is correct markup that a competent author wrote deliberately.

  it('never reports Persian written in the Arabic script', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownLang: 'fa' }))).toEqual([]);
  });

  it('never reports Urdu, Pashto, Sorani Kurdish, Sindhi or Uyghur in the Arabic script', () => {
    for (const language of ['ur', 'ps', 'ckb', 'sd', 'ug', 'ku']) {
      expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownLang: language }))).toEqual([]);
    }
  });

  it('never reports Han under lang="ja", which mixes three scripts in one sentence', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.hanLong, { ownLang: 'ja' }))).toEqual([]);
  });

  it('never reports Han under lang="ko"', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.hanLong, { ownLang: 'ko' }))).toEqual([]);
  });

  it('never reports Latin under lang="vi"', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.vietnameseLong, { ownLang: 'vi' }))).toEqual([]);
  });

  it('accepts an explicit script subtag as final', () => {
    // sr-Latn is Latin even though Serbian defaults to Cyrillic. The author told us, so we stop
    // guessing — and a subtag that contradicts the language table wins over it.
    expect(rule.check(snapshotOfOne(SAMPLES.latinLong, { ownLang: 'sr-Latn' }))).toEqual([]);
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownLang: 'ku-Arab' }))).toEqual([]);
  });

  it('says nothing for a language it has no expectation for', () => {
    // An unknown subtag means no expectation, and no expectation is a reason to stay silent.
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownLang: 'zxx' }))).toEqual([]);
  });

  it('says nothing when no language is declared anywhere', () => {
    // A missing lang attribute is a real defect, and it is axe-core that reports it.
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong))).toEqual([]);
  });
});

describe('lang-script-mismatch — must not flag', () => {
  it('never reports code, however Latin it is', () => {
    expect(
      rule.check(snapshotOfOne(SAMPLES.latinLong, { ownLang: 'ar', tagName: 'CODE' })),
    ).toEqual([]);
  });

  it('never reports a syntax-highlighted span inside a pre', () => {
    // The shape that the tag name alone would miss: the element holding the text is a span, and
    // only its ancestry says it is code.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.latinLong, {
          ownLang: 'ar',
          tagName: 'SPAN',
          hasCodeAncestor: true,
        }),
      ),
    ).toEqual([]);
  });

  it('never reports text below the length threshold', () => {
    // Fewer than 20 graphemes: a heading, a caption, a quoted phrase.
    expect(rule.check(snapshotOfOne(SAMPLES.arabic, { ownLang: 'en' }))).toEqual([]);
  });

  it('never reports a passage that no single script dominates', () => {
    const mixed = `${SAMPLES.arabicLong} ${SAMPLES.latinLong}`;
    expect(rule.check(snapshotOfOne(mixed, { ownLang: 'en' }))).toEqual([]);
  });

  it('never reports a writing system it does not model', () => {
    // Bengali under lang="en" is a genuine mismatch that we decline to name, because naming it
    // would mean claiming to model it. Decision 007 counts those nodes separately instead.
    const bengaliLong = `${SAMPLES.bengali} ${SAMPLES.bengali} ${SAMPLES.bengali} ${SAMPLES.bengali} ${SAMPLES.bengali}`;
    expect(rule.check(snapshotOfOne(bengaliLong, { ownLang: 'en' }))).toEqual([]);
  });
});

describe('lang-script-mismatch — contract', () => {
  it('applies to every writing system it models', () => {
    expect(rule.affectedScripts).toHaveLength(16);
  });

  it('admits in its limitations what it declines to report', () => {
    expect(rule.limitations).toContain('does not model');
    expect(rule.confidence).toBe('medium');
  });
});
