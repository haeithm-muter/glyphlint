import { describe, expect, it } from 'vitest';

import { insufficientLineHeightForScript as rule } from '../../src/rules/insufficient-line-height-for-script.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

/** A box tall enough to hold several lines, which is what the rule requires before it speaks. */
const MULTI_LINE_BOX = { clientHeight: 80, scrollHeight: 80 };

describe('insufficient-line-height-for-script — the defect', () => {
  it('flags Thai set at 1.1', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.thaiLong, {
        css: { lineHeight: '17.6px', fontSize: '16px' },
        box: MULTI_LINE_BOX,
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('thai');
    expect(violations[0]?.whatIsWrong).toContain('1.1');
  });

  it('flags Devanagari below the WCAG line spacing', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.devanagari, {
        css: { lineHeight: '20px', fontSize: '16px' },
        box: MULTI_LINE_BOX,
      }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('devanagari');
  });
});

describe('insufficient-line-height-for-script — clean pages', () => {
  it('says nothing at exactly the threshold', () => {
    // 1.5 is the requirement, so 1.5 meets it. An off-by-one here would report every page that
    // did precisely what it was asked to do.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.devanagari, {
          css: { lineHeight: '24px', fontSize: '16px' },
          box: MULTI_LINE_BOX,
        }),
      ),
    ).toEqual([]);
  });

  it('never flags line-height: normal', () => {
    // The browser derives `normal` from the metrics of the font itself, which for a well-made
    // Thai or Devanagari font already allows for the marks. Reporting it would be guessing about
    // a typeface we cannot see.
    expect(
      rule.check(snapshotOfOne(SAMPLES.thaiLong, { css: { lineHeight: 'normal' }, box: MULTI_LINE_BOX })),
    ).toEqual([]);
  });
});

describe('insufficient-line-height-for-script — edges', () => {
  it('ignores a box that holds a single line', () => {
    // Measured in Chromium: a `<p>` at 16px with `line-height: 1.1` reports a client height of
    // 18px. One line cannot collide with the line above it, because there is no line above it.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.thai, {
          css: { lineHeight: '17.6px', fontSize: '16px' },
          box: { clientHeight: 18, scrollHeight: 18 },
        }),
      ),
    ).toEqual([]);
  });

  it('ignores form controls, where line-height centres text rather than spacing it', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabicLong, {
          tagName: 'BUTTON',
          css: { lineHeight: '16px', fontSize: '16px' },
          box: MULTI_LINE_BOX,
        }),
      ),
    ).toEqual([]);
  });

  it('cites WCAG only when the measured value breaches the number WCAG names', () => {
    // Thai is held to 1.6, which is our estimate. Between 1.5 and 1.6 the text is short of what
    // we think the script needs, and short of nothing any standard requires — so the finding
    // carries no citation.
    const ourEstimate = rule.check(
      snapshotOfOne(SAMPLES.thaiLong, {
        css: { lineHeight: '24.8px', fontSize: '16px' },
        box: MULTI_LINE_BOX,
      }),
    );
    expect(ourEstimate).toHaveLength(1);
    expect(ourEstimate[0]?.wcagRef).toBeUndefined();
    expect(ourEstimate[0]?.whatIsWrong).toContain('our own estimate');

    const belowWcag = rule.check(
      snapshotOfOne(SAMPLES.thaiLong, {
        css: { lineHeight: '17.6px', fontSize: '16px' },
        box: MULTI_LINE_BOX,
      }),
    );
    expect(belowWcag[0]?.wcagRef).toBe('1.4.8');
  });
});

describe('insufficient-line-height-for-script — must not flag', () => {
  it('leaves Mongolian alone, which has no line-height ratio at all', () => {
    // Mongolian runs in vertical columns. A ratio of line height to font size describes
    // horizontal lines, so we have no threshold for it and say nothing rather than inventing one.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.mongolian, {
          css: { lineHeight: '16px', fontSize: '16px' },
          box: MULTI_LINE_BOX,
        }),
      ),
    ).toEqual([]);
  });

  it('leaves digits and punctuation alone', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.digits, {
          css: { lineHeight: '16px', fontSize: '16px' },
          box: MULTI_LINE_BOX,
        }),
      ),
    ).toEqual([]);
  });

  it('stays silent on a writing system it does not model', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.bengali, {
          css: { lineHeight: '16px', fontSize: '16px' },
          box: MULTI_LINE_BOX,
        }),
      ),
    ).toEqual([]);
  });
});

describe('insufficient-line-height-for-script — the finding itself', () => {
  it('is marked heuristic and says why in its limitations', () => {
    expect(rule.confidence).toBe('heuristic');
    expect(rule.severity).toBe('moderate');
    expect(rule.limitations).toContain('estimates');
    expect(rule.limitations).toContain('normal');
  });

  it('names the estimate as an estimate inside the finding, not only in the README', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.thaiLong, {
        css: { lineHeight: '20px', fontSize: '16px' },
        box: MULTI_LINE_BOX,
      }),
    );

    expect(violations[0]?.whatIsWrong).toContain('estimate');
  });

  it('declares every script that has a ratio, and no others', () => {
    expect(rule.affectedScripts).not.toContain('mongolian');
    expect(rule.affectedScripts).toContain('thai');
    expect(rule.affectedScripts).toContain('latin');
  });
});
