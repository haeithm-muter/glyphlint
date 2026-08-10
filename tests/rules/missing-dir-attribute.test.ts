import { describe, expect, it } from 'vitest';

import { missingDirAttribute as rule } from '../../src/rules/missing-dir-attribute.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

describe('missing-dir-attribute — the violating case', () => {
  const violation = rule.check(snapshotOfOne(SAMPLES.arabicLong))[0];

  it('reports right-to-left text with no dir anywhere above it', () => {
    expect(violation).toBeDefined();
    expect(violation?.script).toBe('arabic');
  });

  it('reports it at full severity when the text is laid out left-to-right', () => {
    // Nothing declared the direction and nothing styled it, so the page is showing Arabic in a
    // left-to-right paragraph. This is the serious form of the defect.
    expect(violation?.severity).toBe('serious');
    expect(violation?.whatIsWrong).toContain('no dir attribute');
  });

  it('names the fix in a way the author can act on', () => {
    expect(violation?.howToFix).toContain('dir="rtl"');
    expect(violation?.howToFix).toContain('dir="auto"');
  });
});

describe('missing-dir-attribute — the clean cases', () => {
  it('says nothing when the element declares dir itself', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownDir: 'rtl' }))).toEqual([]);
  });

  it('says nothing when an ancestor declares dir', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { inheritedDir: 'rtl' }))).toEqual([]);
  });

  it('says nothing about a left-to-right script', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.latin))).toEqual([]);
    expect(rule.check(snapshotOfOne(SAMPLES.thaiLong))).toEqual([]);
  });
});

describe('missing-dir-attribute — the reduced case', () => {
  const violation = rule.check(
    snapshotOfOne(SAMPLES.arabicLong, {
      computedDirection: 'rtl',
      css: { direction: 'rtl' },
    }),
  )[0];

  it('still reports direction that comes only from CSS', () => {
    expect(violation).toBeDefined();
    expect(violation?.whatIsWrong).toContain('CSS');
  });

  it('reports it as moderate rather than serious', () => {
    // The page looks correct, so the finding is weaker — but it is still a finding, because the
    // attribute is what reaches the accessibility tree and a stylesheet is not.
    expect(violation?.severity).toBe('moderate');
    expect(rule.severity).toBe('serious');
  });

  it('explains why a correct-looking page is still reported', () => {
    expect(violation?.whyItMatters).toContain('accessibility tree');
  });
});

describe('missing-dir-attribute — must not flag', () => {
  it('never reports a short right-to-left fragment inside another language', () => {
    // A brand name or a single word is placed correctly by the bidirectional algorithm on its own.
    // Reporting these would bury the pages with a genuinely undeclared Arabic paragraph.
    expect(rule.check(snapshotOfOne(SAMPLES.arabic))).toEqual([]);
    expect(rule.check(snapshotOfOne(SAMPLES.hebrew))).toEqual([]);
  });

  it('never reports text under dir="auto", which is the correct markup', () => {
    // The measured trap: dir="auto" resolves to rtl for Arabic content, so a rule that could only
    // see dir="rtl" would report the pages that handled direction properly.
    expect(
      rule.check(
        snapshotOfOne(SAMPLES.arabicLong, { inheritedDir: 'auto', computedDirection: 'rtl' }),
      ),
    ).toEqual([]);
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong, { ownDir: 'auto' }))).toEqual([]);
  });

  it('never reports text with no letters at all', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.digits))).toEqual([]);
  });

  it('never reports a writing system it does not model', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.bengali))).toEqual([]);
  });
});

describe('missing-dir-attribute — contract', () => {
  it('declares only right-to-left scripts as affected', () => {
    expect(rule.affectedScripts).toEqual(['arabic', 'hebrew', 'nko', 'syriac', 'thaana']);
    // Mongolian is cursive and vertical, not right-to-left, and must not appear here.
    expect(rule.affectedScripts).not.toContain('mongolian');
  });

  it('states in its limitations what it does not report', () => {
    expect(rule.limitations).toContain('dir="ltr"');
    expect(rule.limitations).toContain('dir="auto"');
    expect(rule.confidence).toBe('medium');
  });
});
