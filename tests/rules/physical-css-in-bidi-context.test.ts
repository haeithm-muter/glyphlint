import { describe, expect, it } from 'vitest';

import { physicalCssInBidiContext as rule } from '../../src/rules/physical-css-in-bidi-context.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

/** Every case here is right-to-left, which is the only context the rule looks at. */
const RTL = { computedDirection: 'rtl' } as const;

describe('physical-css-in-bidi-context — the violating cases', () => {
  it('reports text-align: left as wrong on the screen now', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabicLong, { ...RTL, css: { textAlign: 'left' } }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('moderate');
    expect(violations[0]?.whatIsWrong).toContain('text-align: left');
    expect(violations[0]?.whyItMatters).toContain('against the direction it reads in');
  });

  it('reports text-align: right as a defect that has not surfaced yet', () => {
    // Visually correct in this context and wrong the moment the component is rendered
    // left-to-right. Saying which one it is decides whether an author acts on the finding.
    const violation = rule.check(
      snapshotOfOne(SAMPLES.arabicLong, { ...RTL, css: { textAlign: 'right' } }),
    )[0];

    expect(violation?.whatIsWrong).toContain('text-align: right');
    expect(violation?.whyItMatters).toContain('happens to look correct here');
  });

  it('names the logical replacements in the fix', () => {
    const violation = rule.check(
      snapshotOfOne(SAMPLES.arabicLong, { ...RTL, css: { textAlign: 'left' } }),
    )[0];

    expect(violation?.howToFix).toContain('text-align: start');
    expect(violation?.howToFix).toContain('text-align: end');
  });
});

describe('physical-css-in-bidi-context — the clean cases', () => {
  it('says nothing in a left-to-right context', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.latinLong, { css: { textAlign: 'left' } }))).toEqual(
      [],
    );
  });

  it('says nothing about logical alignment', () => {
    for (const textAlign of ['start', 'end']) {
      expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ...RTL, css: { textAlign } }))).toEqual(
        [],
      );
    }
  });

  it('says nothing about the default alignment', () => {
    // Chromium computes `start` when nothing was declared, so an untouched paragraph is clean.
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ...RTL }))).toEqual([]);
  });

  it('says nothing about centred or justified text', () => {
    for (const textAlign of ['center', 'justify']) {
      expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ...RTL, css: { textAlign } }))).toEqual(
        [],
      );
    }
  });
});

describe('physical-css-in-bidi-context — must not flag', () => {
  it('never reports a physical margin, because it cannot tell one from the fix', () => {
    // Measured: in a right-to-left context, `margin-right: 40px` and `margin-inline-start: 40px`
    // produce byte-identical computed values on every property. Reporting the first would report
    // the second, and the second is the correct code this rule would otherwise recommend.
    // See decision 013.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabicLong, {
          ...RTL,
          css: { marginLeft: '0px', marginRight: '40px' },
        }),
      ),
    ).toEqual([]);
  });

  it('never reports asymmetric padding, for the same reason', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabicLong, {
          ...RTL,
          css: { paddingLeft: '32px', paddingRight: '8px' },
        }),
      ),
    ).toEqual([]);
  });

  it('never reports the button the browser padded from its own stylesheet', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabicLong, {
          ...RTL,
          tagName: 'BUTTON',
          css: { paddingLeft: '6px', paddingRight: '6px', textAlign: 'center' },
        }),
      ),
    ).toEqual([]);
  });
});

describe('physical-css-in-bidi-context — contract', () => {
  it('declares only right-to-left scripts as affected', () => {
    expect(rule.affectedScripts).toEqual(['arabic', 'hebrew', 'nko', 'syriac', 'thaana']);
  });

  it('admits in its limitations that it covers only half the defect', () => {
    expect(rule.limitations).toContain('Advisory');
    expect(rule.limitations).toContain('covers alignment only');
    expect(rule.description).toContain('decision 013');
    expect(rule.confidence).toBe('medium');
  });
});
