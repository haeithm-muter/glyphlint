import { describe, expect, it } from 'vitest';

import { caseTransformOnCaselessScript as rule } from '../../src/rules/case-transform-on-caseless-script.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

describe('case-transform-on-caseless-script — the defect', () => {
  it('flags uppercase on Arabic', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabic, { css: { textTransform: 'uppercase' } }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('arabic');
    expect(violations[0]?.whatIsWrong).toContain('uppercase');
  });

  it('flags all three case transforms', () => {
    for (const transform of ['uppercase', 'lowercase', 'capitalize']) {
      const violations = rule.check(
        snapshotOfOne(SAMPLES.thai, { css: { textTransform: transform } }),
      );
      expect(violations).toHaveLength(1);
    }
  });

  it('flags every caseless script, including the CJK ones', () => {
    for (const sample of [SAMPLES.hebrew, SAMPLES.devanagari, SAMPLES.han, SAMPLES.hangul]) {
      const violations = rule.check(snapshotOfOne(sample, { css: { textTransform: 'uppercase' } }));
      expect(violations).toHaveLength(1);
    }
  });
});

describe('case-transform-on-caseless-script — clean pages', () => {
  it('says nothing when no case transform is applied', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabic))).toEqual([]);
  });

  it('ignores transforms that are not case conversions', () => {
    // Chromium also computes `full-width`, `full-size-kana` and `math-auto` for this property.
    // None of them is a case conversion, and `full-width` is in fact meaningful for CJK.
    for (const transform of ['none', 'full-width', 'full-size-kana', 'math-auto']) {
      expect(rule.check(snapshotOfOne(SAMPLES.han, { css: { textTransform: transform } }))).toEqual(
        [],
      );
    }
  });
});

describe('case-transform-on-caseless-script — edges', () => {
  it('ignores a node where enough Latin sits beside the caseless script', () => {
    // Here the property does have something to act on: a product name, a code, an acronym.
    // Reporting it would be reporting CSS that is working.
    const mixed = `${SAMPLES.arabic} GlyphLint Accessibility Scanner`;
    expect(rule.check(snapshotOfOne(mixed, { css: { textTransform: 'uppercase' } }))).toEqual([]);
  });

  it('still flags a node whose Latin is incidental', () => {
    const mostlyArabic = `${SAMPLES.arabicLong} ok`;
    expect(
      rule.check(snapshotOfOne(mostlyArabic, { css: { textTransform: 'uppercase' } })),
    ).toHaveLength(1);
  });

  it('reads the computed value case-insensitively', () => {
    expect(
      rule.check(snapshotOfOne(SAMPLES.arabic, { css: { textTransform: 'UPPERCASE' } })),
    ).toHaveLength(1);
  });
});

describe('case-transform-on-caseless-script — must not flag', () => {
  it('leaves Latin alone', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.latin, { css: { textTransform: 'uppercase' } }))).toEqual(
      [],
    );
  });

  it('leaves Cyrillic and Greek alone, which have case like Latin', () => {
    // The likely mistake: treating "not Latin" as "no case". Both of these are bicameral, and
    // uppercasing them is a normal, working piece of CSS.
    for (const sample of [SAMPLES.cyrillic, SAMPLES.greek]) {
      expect(rule.check(snapshotOfOne(sample, { css: { textTransform: 'uppercase' } }))).toEqual([]);
    }
  });

  it('leaves digits and punctuation alone', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.digits, { css: { textTransform: 'uppercase' } }))).toEqual(
      [],
    );
  });

  it('stays silent on a writing system it does not model', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.bengali, { css: { textTransform: 'uppercase' } }))).toEqual(
      [],
    );
  });
});

describe('case-transform-on-caseless-script — the finding itself', () => {
  it('is minor, and its limitations say why', () => {
    expect(rule.severity).toBe('minor');
    expect(rule.confidence).toBe('high');
    expect(rule.limitations).toContain('signal, not damage');
  });

  it('tells the reader what the finding is really pointing at', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabic, { css: { textTransform: 'uppercase' } }),
    );

    expect(violations[0]?.whyItMatters).toContain('no upper and lower case');
    expect(violations[0]?.howToFix).toContain(':lang()');
  });

  it('declares exactly the caseless scripts as affected', () => {
    expect(rule.affectedScripts).not.toContain('latin');
    expect(rule.affectedScripts).not.toContain('cyrillic');
    expect(rule.affectedScripts).not.toContain('greek');
    expect(rule.affectedScripts).toHaveLength(13);
  });
});
