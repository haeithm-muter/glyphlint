import { describe, expect, it } from 'vitest';

import { clippedStackedMarks as rule } from '../../src/rules/clipped-stacked-marks.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

/** A box that hides what does not fit, with more content than it can hold. */
const CLIPPED = {
  css: { overflowY: 'hidden', overflowX: 'hidden', height: '40px' },
  box: { clientHeight: 40, scrollHeight: 60 },
} as const;

/**
 * The visually-hidden idiom, copied from the real page where this rule was caught reporting it.
 *
 * One pixel square, overflow hidden, content far taller than the box — identical measurements to a
 * genuinely clipped container, and correct accessibility work rather than a defect.
 */
const SCREEN_READER_HIDDEN = {
  css: {
    overflowY: 'hidden',
    overflowX: 'hidden',
    height: '1px',
    clip: 'rect(1px, 1px, 1px, 1px)',
    clipPath: 'inset(100%)',
  },
  box: { clientHeight: 1, clientWidth: 1, scrollHeight: 24, scrollWidth: 200 },
} as const;

describe('clipped-stacked-marks — text hidden on purpose for screen readers', () => {
  it('does not report the pattern found on a real homepage', () => {
    // Decision 025. Every clipping finding on that page was this idiom, on markup doing exactly
    // the right thing, and reporting it meant reporting accessibility work as an accessibility
    // defect.
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, SCREEN_READER_HIDDEN))).toEqual([]);
  });

  it('accepts the deprecated clip and the modern clip-path independently', () => {
    const clipOnly = snapshotOfOne(SAMPLES.thaiLong, {
      css: { overflowY: 'hidden', clip: 'rect(1px, 1px, 1px, 1px)', clipPath: 'none' },
      box: { clientHeight: 1, clientWidth: 1, scrollHeight: 24 },
    });
    const clipPathOnly = snapshotOfOne(SAMPLES.thaiLong, {
      css: { overflowY: 'hidden', clip: 'auto', clipPath: 'inset(100%)' },
      box: { clientHeight: 1, clientWidth: 1, scrollHeight: 24 },
    });

    expect(rule.check(clipOnly)).toEqual([]);
    expect(rule.check(clipPathOnly)).toEqual([]);
  });

  it('still reports a clipped box that is large enough to be showing something', () => {
    // The near miss that keeps the exemption narrow: same clip, real dimensions. A box 200px wide
    // is displaying text to somebody, and cutting it is still cutting it.
    const visible = snapshotOfOne(SAMPLES.thaiLong, {
      css: { overflowY: 'hidden', clipPath: 'inset(100%)' },
      box: { clientHeight: 20, clientWidth: 200, scrollHeight: 60 },
    });

    expect(rule.check(visible)).toHaveLength(1);
  });

  it('still reports a one-pixel box that carries no clip at all', () => {
    // A tiny box on its own is a broken container, not a hiding technique. Both halves are needed.
    const tinyButUnclipped = snapshotOfOne(SAMPLES.thaiLong, {
      css: { overflowY: 'hidden', clip: 'auto', clipPath: 'none' },
      box: { clientHeight: 1, clientWidth: 1, scrollHeight: 24 },
    });

    expect(rule.check(tinyButUnclipped)).toHaveLength(1);
  });

  it('does not treat a decorative crop of a visible element as hidden text', () => {
    const decorative = snapshotOfOne(SAMPLES.thaiLong, {
      css: { overflowY: 'hidden', clipPath: 'inset(10%)' },
      box: { clientHeight: 40, clientWidth: 300, scrollHeight: 60 },
    });

    expect(rule.check(decorative)).toHaveLength(1);
  });
});

describe('clipped-stacked-marks — the violating cases', () => {
  it('reports Thai cut off by a fixed height', () => {
    const violations = rule.check(snapshotOfOne(SAMPLES.thaiLong, CLIPPED));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('thai');
    expect(violations[0]?.severity).toBe('moderate');
    expect(violations[0]?.confidence).toBe('heuristic');
  });

  it('names both measurements, so the finding can be checked', () => {
    const violation = rule.check(snapshotOfOne(SAMPLES.thaiLong, CLIPPED))[0];

    expect(violation?.whatIsWrong).toContain('60px');
    expect(violation?.whatIsWrong).toContain('40px');
  });

  it('reports Latin carrying the Vietnamese profile', () => {
    // Vietnamese is not a script and has no row of its own. It arrives here with stacked marks
    // because `propertiesFor` resolves the profile to its own property row — decision 003.
    const violation = rule.check(snapshotOfOne(SAMPLES.vietnameseLong, CLIPPED))[0];

    expect(violation).toBeDefined();
    expect(violation?.script).toBe('latin');
  });

  it('names the line clamp when that is what is doing the cutting', () => {
    const violation = rule.check(
      snapshotOfOne(SAMPLES.thaiLong, {
        css: { overflowY: 'hidden', webkitLineClamp: '2', height: '40px' },
        box: { clientHeight: 40, scrollHeight: 60 },
      }),
    )[0];

    expect(violation?.whatIsWrong).toContain('-webkit-line-clamp of 2');
    expect(violation?.howToFix).toContain('Raise the line clamp');
  });

  it('explains that the loss is meaning rather than length', () => {
    const violation = rule.check(snapshotOfOne(SAMPLES.thaiLong, CLIPPED))[0];

    expect(violation?.whyItMatters).toContain('A clipped tone mark is a different word');
  });
});

describe('clipped-stacked-marks — must not flag', () => {
  it('never reports text that overflows a box which does not hide it', () => {
    // Measured control: the content is taller than the box and every pixel of it is still on the
    // screen. Nothing has been taken from the reader, so there is nothing to report.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.thaiLong, {
          css: { overflowY: 'visible' },
          box: { clientHeight: 12, scrollHeight: 20 },
        }),
      ),
    ).toEqual([]);
  });

  it('never reports a scrollable container', () => {
    // The reader can reach the rest of the text.
    for (const overflowY of ['auto', 'scroll']) {
      expect(
        rule.check(
          snapshotOfOne(SAMPLES.thaiLong, {
            css: { overflowY },
            box: { clientHeight: 40, scrollHeight: 60 },
          }),
        ),
      ).toEqual([]);
    }
  });

  it('never reports a box that fits its content', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.thaiLong, {
          css: { overflowY: 'hidden' },
          box: { clientHeight: 200, scrollHeight: 200 },
        }),
      ),
    ).toEqual([]);
  });

  it('never reports a one-pixel difference as clipping', () => {
    // Sub-pixel layout reported as rounded integers: a box clipping nothing can still differ by a
    // pixel from its content.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.thaiLong, {
          css: { overflowY: 'hidden' },
          box: { clientHeight: 40, scrollHeight: 41 },
        }),
      ),
    ).toEqual([]);
  });

  it('never reports a script with no stacked marks, however hard it is clipped', () => {
    // Ordinary truncation of Latin, Han or Hangul is a design decision, not our business.
    for (const sample of [SAMPLES.latinLong, SAMPLES.hanLong, SAMPLES.hangul]) {
      expect(rule.check(snapshotOfOne(sample, CLIPPED))).toEqual([]);
    }
  });

  it('never reports a writing system it does not model', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.bengali, CLIPPED))).toEqual([]);
  });
});

describe('clipped-stacked-marks — marks found in the text itself', () => {
  it('reports a combining mark on a script whose table row does not carry the flag', () => {
    // Latin has no stacked marks as a rule, and this particular text does.
    const withCombiningAcute = `cafe${String.fromCodePoint(0x0301)} cafe${String.fromCodePoint(0x0301)}`;
    const violations = rule.check(snapshotOfOne(withCombiningAcute, CLIPPED));

    expect(violations).toHaveLength(1);
  });
});

describe('clipped-stacked-marks — contract', () => {
  it('affects exactly the scripts with stacked marks', () => {
    expect(rule.affectedScripts).toEqual([
      'arabic',
      'devanagari',
      'hebrew',
      'khmer',
      'lao',
      'mongolian',
      'nko',
      'syriac',
      'thaana',
      'thai',
    ]);
  });

  it('states the blind spot it shares a border with', () => {
    // What this rule cannot see is exactly what insufficient-line-height-for-script reports, and
    // the limitations say so rather than letting the silence read as coverage.
    expect(rule.limitations).toContain('cannot see ink');
    expect(rule.limitations).toContain('insufficient-line-height-for-script');
    expect(rule.limitations).toContain('clipping wrapper');
  });
});
