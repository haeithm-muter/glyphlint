import { describe, expect, it } from 'vitest';

import { missingScriptFontCoverage as rule } from '../../src/rules/missing-script-font-coverage.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

/** What the scanner reports when the declared stack measured identically to a missing family. */
const SUSPECTED = {
  declaredStack: ['Noto Sans Thai', 'sans-serif'],
  renderedFamily: null,
  fallbackSuspected: true,
};

describe('missing-script-font-coverage — the defect', () => {
  it('flags Thai whose declared stack appears not to be rendering', () => {
    const violations = rule.check(snapshotOfOne(SAMPLES.thai, { fontProbe: SUSPECTED }));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('thai');
    expect(violations[0]?.whatIsWrong).toContain('Noto Sans Thai');
  });

  it('flags Devanagari on the same evidence', () => {
    const violations = rule.check(snapshotOfOne(SAMPLES.devanagari, { fontProbe: SUSPECTED }));

    expect(violations).toHaveLength(1);
    expect(violations[0]?.script).toBe('devanagari');
  });
});

describe('missing-script-font-coverage — clean pages', () => {
  it('says nothing when the declared stack is measurably doing the work', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.thai))).toEqual([]);
  });

  it('says nothing when the probe is uncertain but not suspicious', () => {
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabic, {
          fontProbe: { declaredStack: ['Amiri'], renderedFamily: null, fallbackSuspected: false },
        }),
      ),
    ).toEqual([]);
  });
});

describe('missing-script-font-coverage — edges', () => {
  it('ignores a single glyph, where a coincidental width match is most likely', () => {
    // One Arabic letter, meem.
    const oneLetter = String.fromCodePoint(0x0645);
    expect(rule.check(snapshotOfOne(oneLetter, { fontProbe: SUSPECTED }))).toEqual([]);
  });

  it('does not require a word to be four characters long to count as text', () => {
    // A two-character Chinese word is a word. A threshold tuned to alphabetic scripts would have
    // excluded most of Chinese and Japanese without anyone noticing.
    expect(rule.check(snapshotOfOne(SAMPLES.han, { fontProbe: SUSPECTED }))).toHaveLength(1);
  });

  it('names the declared families in the finding, so the reader knows what was measured', () => {
    const violations = rule.check(snapshotOfOne(SAMPLES.han, { fontProbe: SUSPECTED }));

    expect(violations[0]?.whatIsWrong).toContain('sans-serif');
  });
});

describe('missing-script-font-coverage — must not flag', () => {
  it('never reports Latin, however suspicious the measurement', () => {
    // The deliberate narrowing. The one case where this measurement is known to be wrong is a
    // stack that resolves to the platform default font, and that is a Latin stack almost every
    // time — see decision 005.
    expect(rule.check(snapshotOfOne(SAMPLES.latin, { fontProbe: SUSPECTED }))).toEqual([]);
  });

  it('never reports Latin carrying the Vietnamese profile either', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.vietnamese, { fontProbe: SUSPECTED }))).toEqual([]);
  });

  it('leaves digits and punctuation alone', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.digits, { fontProbe: SUSPECTED }))).toEqual([]);
  });

  it('stays silent on a writing system it does not model', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.bengali, { fontProbe: SUSPECTED }))).toEqual([]);
  });
});

describe('missing-script-font-coverage — the finding itself', () => {
  it('is marked heuristic and admits what the measurement cannot tell apart', () => {
    expect(rule.confidence).toBe('heuristic');
    expect(rule.severity).toBe('serious');
    expect(rule.limitations).toContain('inferred, not verified');
    expect(rule.limitations).toContain('last-resort');
  });

  it('claims no WCAG criterion, because none covers this', () => {
    const violations = rule.check(snapshotOfOne(SAMPLES.thai, { fontProbe: SUSPECTED }));

    expect(rule.wcagRef).toBeUndefined();
    expect(violations[0]?.wcagRef).toBeUndefined();
  });

  it('declares every script except Latin as affected', () => {
    expect(rule.affectedScripts).not.toContain('latin');
    expect(rule.affectedScripts).toContain('arabic');
    expect(rule.affectedScripts).toContain('thai');
    expect(rule.affectedScripts).toHaveLength(15);
  });
});
