import { describe, expect, it } from 'vitest';

import { unmirroredDirectionalIcon as rule } from '../../src/rules/unmirrored-directional-icon.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

const RTL = { computedDirection: 'rtl' } as const;

/** The computed forms Chromium actually produces, measured rather than assumed. */
const MATRIX = {
  scaleXMinusOne: 'matrix(-1, 0, 0, 1, 0, 0)',
  rotate180: 'matrix(-1, 0, 0, -1, 0, 0)',
  rotate90: 'matrix(0, 1, -1, 0, 0, 0)',
  translateX: 'matrix(1, 0, 0, 1, 10, 0)',
  scaleUp: 'matrix(1.5, 0, 0, 1.5, 0, 0)',
} as const;

describe('unmirrored-directional-icon — the violating cases', () => {
  it('reports an arrow character in a right-to-left context', () => {
    const violations = rule.check(snapshotOfOne(`${SAMPLES.arabic} →`, { ...RTL }));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.severity).toBe('minor');
    expect(violations[0]?.whatIsWrong).toContain('→');
  });

  it('reports a directional class name', () => {
    const violations = rule.check(
      snapshotOfOne(SAMPLES.arabic, { ...RTL, classNames: ['icon', 'chevron-right'] }),
    );

    expect(violations).toHaveLength(1);
    expect(violations[0]?.whatIsWrong).toContain('chevron-right');
  });

  it('explains that the icon looks intact rather than broken', () => {
    const violation = rule.check(snapshotOfOne(`${SAMPLES.arabic} →`, { ...RTL }))[0];
    expect(violation?.whyItMatters).toContain('Nothing about it looks broken');
  });
});

describe('unmirrored-directional-icon — reading the matrix, not the declaration', () => {
  // The measured trap: the browser resolves every transform function into a matrix, so a page
  // that mirrors correctly with scaleX(-1) contains the string `scaleX` nowhere at all.

  it('credits scaleX(-1), which arrives as a matrix', () => {
    expect(
      rule.check(
        snapshotOfOne(`${SAMPLES.arabic} →`, {
          ...RTL,
          css: { transform: MATRIX.scaleXMinusOne },
        }),
      ),
    ).toEqual([]);
  });

  it('credits a half turn, where both shear terms are zero', () => {
    // rotate(180deg) is matrix(-1, 0, 0, -1, 0, 0). A rule that looked for a non-zero shear term
    // to detect rotation would miss the most common way an arrow is turned around.
    expect(
      rule.check(
        snapshotOfOne(`${SAMPLES.arabic} →`, { ...RTL, css: { transform: MATRIX.rotate180 } }),
      ),
    ).toEqual([]);
  });

  it('credits a quarter turn', () => {
    expect(
      rule.check(
        snapshotOfOne(`${SAMPLES.arabic} →`, { ...RTL, css: { transform: MATRIX.rotate90 } }),
      ),
    ).toEqual([]);
  });

  it('credits mirroring applied by a wrapper', () => {
    // Icon systems mirror from a parent far more often than from the icon itself.
    expect(
      rule.check(
        snapshotOfOne(`${SAMPLES.arabic} →`, { ...RTL, hasTransformedAncestor: true }),
      ),
    ).toEqual([]);
  });

  it('does not credit a transform that leaves the arrow pointing where it was', () => {
    for (const transform of [MATRIX.translateX, MATRIX.scaleUp]) {
      expect(
        rule.check(snapshotOfOne(`${SAMPLES.arabic} →`, { ...RTL, css: { transform } })),
      ).toHaveLength(1);
    }
  });
});

describe('unmirrored-directional-icon — must not flag', () => {
  it('never reports in a left-to-right context', () => {
    expect(rule.check(snapshotOfOne('Next →'))).toEqual([]);
  });

  it('never reports a vertical arrow', () => {
    // Up and down mean the same thing in every direction. Mirroring them would introduce the bug
    // this rule exists to find.
    expect(rule.check(snapshotOfOne(`${SAMPLES.arabic} ↑ ↓`, { ...RTL }))).toEqual([]);
  });

  it('never reports a class name that merely contains a direction word', () => {
    // `left-column` is a layout class, not an icon. The pattern requires a direction word bound to
    // an icon word by a separator.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabic, { ...RTL, classNames: ['left-column', 'rightmost'] }),
      ),
    ).toEqual([]);
  });

  it('never reports ordinary text with no direction in it', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ...RTL }))).toEqual([]);
  });
});

describe('unmirrored-directional-icon — contract', () => {
  it('states plainly that most arrows never reach it', () => {
    // The honest limit: the scan captures text nodes, and an SVG or a ::before icon is not one.
    expect(rule.limitations).toContain('most arrows are not text');
    expect(rule.limitations).toContain('is not evidence');
    expect(rule.confidence).toBe('heuristic');
  });

  it('warns that some arrows must not mirror', () => {
    expect(rule.limitations).toContain('play triangle');
  });
});
