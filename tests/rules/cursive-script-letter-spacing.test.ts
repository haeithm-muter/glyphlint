import { describe, expect, it } from 'vitest';

import { cursiveScriptLetterSpacing as rule } from '../../src/rules/cursive-script-letter-spacing.js';
import { SAMPLES, snapshotOf, snapshotOfOne, textNode } from './make-snapshot.js';

describe('cursive-script-letter-spacing — the defect', () => {
  it('flags positive tracking on Arabic', () => {
    const violations = rule.check(snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '2px' } }));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('arabic');
    expect(violations[0]?.whatIsWrong).toContain('2px');
    expect(violations[0]?.whatIsWrong).toContain('Arabic');
  });

  it('flags negative tracking too, which collides the letters instead of severing them', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '-0.5px' } }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.whatIsWrong).toContain('-0.5px');
  });

  it('flags every cursive script, not only Arabic', () => {
    for (const sample of [SAMPLES.arabic, SAMPLES.syriac, SAMPLES.nko, SAMPLES.mongolian]) {
      const violations = rule.check(snapshotOfOne(sample, { css: { letterSpacing: '1px' } }));
      expect(violations).toHaveLength(1);
    }
  });

  it('reports a value the browser resolved, not the one the stylesheet wrote', () => {
    // `letter-spacing: 0.12em` at 16px is computed as 1.92px. The finding has to name the pixel
    // value, because that is the only number that describes what the reader is looking at.
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '1.92px' } }),
    );

    expect(violations[0]?.whatIsWrong).toContain('1.92px');
  });
});

describe('cursive-script-letter-spacing — clean pages', () => {
  it('says nothing about Arabic at the default spacing', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabic))).toEqual([]);
  });

  it('treats an explicit zero as no spacing', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '0px' } }))).toEqual(
      [],
    );
  });
});

describe('cursive-script-letter-spacing — edges', () => {
  it('ignores spacing below the rounding-noise floor', () => {
    // A chain of relative units can leave a hundredth of a pixel behind where the author meant
    // nothing at all.
    expect(
      rule.check(snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '0.005px' } })),
    ).toEqual([]);
    expect(
      rule.check(snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '-0.009px' } })),
    ).toEqual([]);
  });

  it('reports the smallest spacing that is above the floor', () => {
    expect(
      rule.check(snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '0.02px' } })),
    ).toHaveLength(1);
  });

  it('ignores a node holding a single letter, which has no join to sever', () => {
    // One Arabic letter, meem.
    const single = String.fromCodePoint(0x0645);
    expect(rule.check(snapshotOfOne(single, { css: { letterSpacing: '2px' } }))).toEqual([]);
  });
});

describe('cursive-script-letter-spacing — must not flag', () => {
  it('leaves a Latin heading inside an Arabic page alone', () => {
    // The rule keys on the dominant script of the node, never on the script of the page. Tracking
    // a Latin headline is a design decision and none of our business.
    const snapshot = snapshotOf([
      textNode(SAMPLES.latin, {
        selector: '#headline',
        css: { letterSpacing: '2px', direction: 'rtl' },
        computedDirection: 'rtl',
        ancestorHasDirRtl: true,
        inheritedLang: 'ar',
      }),
      textNode(SAMPLES.arabicLong, { selector: '#body' }),
    ]);

    expect(rule.check(snapshot)).toEqual([]);
  });

  it('leaves Hebrew alone, which is right-to-left but not cursive', () => {
    // The most likely mistake in the whole rule: Hebrew letters are disconnected, so tracking
    // spaces them out exactly as it spaces out Latin. Nothing breaks.
    expect(rule.check(snapshotOfOne(SAMPLES.hebrew, { css: { letterSpacing: '2px' } }))).toEqual(
      [],
    );
  });

  it('leaves a node of digits and punctuation alone', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.digits, { css: { letterSpacing: '2px' } }))).toEqual(
      [],
    );
  });

  it('stays silent on a writing system it does not model', () => {
    // Bengali. We have no property table for it, so we have no opinion about its typography.
    expect(rule.check(snapshotOfOne(SAMPLES.bengali, { css: { letterSpacing: '2px' } }))).toEqual(
      [],
    );
  });
});

describe('cursive-script-letter-spacing — the finding itself', () => {
  const violation = rule.check(
    snapshotOfOne(SAMPLES.arabic, { css: { letterSpacing: '2px' } }),
  )[0];

  it('carries the metadata the report will group it by', () => {
    expect(violation?.ruleId).toBe('cursive-script-letter-spacing');
    expect(violation?.source).toBe('glyphlint');
    expect(violation?.severity).toBe('critical');
    expect(violation?.confidence).toBe('high');
  });

  it('claims no WCAG criterion, because none covers this defect', () => {
    // The nearest two both fail: SC 1.4.12 is about spacing the reader imposes, and SC 1.4.8
    // governs author-side typography without naming letter spacing at all. Filling the field with
    // the closer of the two would put a citation beside a finding it does not support. See
    // decision 010.
    expect(rule.wcagRef).toBeUndefined();
    expect(violation?.wcagRef).toBeUndefined();
  });

  it('says what is wrong, why it matters for this script, and how to fix it', () => {
    expect(violation?.whatIsWrong).not.toBe('');
    expect(violation?.whyItMatters).toContain('Arabic');
    expect(violation?.howToFix).toContain('letter-spacing');
    expect(violation?.snippet).toBe(SAMPLES.arabic);
  });

  it('describes the tension with WCAG 1.4.12 rather than quoting a criterion at us', () => {
    // The nuance is the point: 1.4.12 is about spacing the reader imposes, and this rule is about
    // spacing the author writes. A rule that blurred the two would be quoting a standard it had
    // not understood — and the tension between them is real, not diplomatic, because the 0.12em
    // the criterion asks content to survive is the tracking that severs the joins.
    expect(rule.description).toContain('1.4.12');
    expect(rule.description).toContain('the reader');
    expect(rule.description).toContain('the author');
    expect(rule.description).toContain('tension');
    expect(rule.limitations).not.toBe('');
  });

  it('declares exactly the cursive scripts as affected', () => {
    expect(rule.affectedScripts).toEqual(['arabic', 'mongolian', 'nko', 'syriac']);
  });
});
