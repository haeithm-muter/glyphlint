import { describe, expect, it } from 'vitest';

import { unisolatedBidiRun as rule } from '../../src/rules/unisolated-bidi-run.js';
import { SAMPLES, snapshotOfOne } from './make-snapshot.js';

describe('unisolated-bidi-run — the violating case', () => {
  const violation = rule.check(snapshotOfOne(SAMPLES.arabicWithLatinAndPunctuation))[0];

  it('reports a Latin run sandwiched in Arabic beside punctuation', () => {
    expect(violation).toBeDefined();
    expect(violation?.script).toBe('arabic');
    expect(violation?.severity).toBe('moderate');
    expect(violation?.confidence).toBe('heuristic');
  });

  it('quotes the run it is talking about', () => {
    expect(violation?.whatIsWrong).toContain('Corp');
  });

  it('prescribes isolation of the run rather than of the paragraph', () => {
    expect(violation?.howToFix).toContain('<bdi>');
    expect(violation?.howToFix).toContain('wrap the run itself');
  });

  it('reports one finding per node however many runs qualify', () => {
    const text = `${SAMPLES.arabicWithLatinAndPunctuation} ${SAMPLES.arabicWithLatinAndPunctuation}`;
    expect(rule.check(snapshotOfOne(text))).toHaveLength(1);
  });
});

describe('unisolated-bidi-run — the narrowing that keeps it honest', () => {
  it('never reports a bare Latin word with no neutral character beside it', () => {
    // A Latin word between two Arabic words renders where a reader expects it. This is the single
    // most important must-not-flag case in the rule: without it the report fills with noise.
    expect(rule.check(snapshotOfOne(SAMPLES.arabicWithBareLatin))).toEqual([]);
  });

  it('never reports a Latin run at the edge of the text', () => {
    // Nothing to be reordered against on one side.
    expect(rule.check(snapshotOfOne(`Acme Corp. ${SAMPLES.arabicLong}`))).toEqual([]);
    expect(rule.check(snapshotOfOne(`${SAMPLES.arabicLong} Acme Corp.`))).toEqual([]);
  });

  it('never reports a single embedded character', () => {
    expect(rule.check(snapshotOfOne('مرحبا السلام A. كتاب مرحبا'))).toEqual([]);
  });
});

describe('unisolated-bidi-run — the clean cases', () => {
  it('says nothing about text with no embedded run at all', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.arabicLong))).toEqual([]);
  });

  it('says nothing about a left-to-right script', () => {
    expect(rule.check(snapshotOfOne('Hello, world. Goodbye'))).toEqual([]);
  });

  it('stays quiet when the author reached for bdi', () => {
    expect(
      rule.check(snapshotOfOne(SAMPLES.arabicWithLatinAndPunctuation, { hasBdiAncestor: true })),
    ).toEqual([]);
  });
});

describe('unisolated-bidi-run — must not flag', () => {
  it('never reports on the unicode-bidi property, which would silence it everywhere', () => {
    // The measured trap: Chromium computes unicode-bidi: isolate on every block element from its
    // own stylesheet, so a rule that skipped isolated elements would never fire on a paragraph.
    // This test asserts the rule ignores that property entirely.
    const isolated = rule.check(
      snapshotOfOne(SAMPLES.arabicWithLatinAndPunctuation, { unicodeBidi: 'isolate' }),
    );
    expect(isolated).toHaveLength(1);
  });

  it('never reports a run isolated by the Unicode characters this rule recommends', () => {
    // `howToFix` names U+2068 and U+2069 as the answer where markup cannot be added. They isolate
    // the run without creating an element, so the text node stays whole and the sandwiched pattern
    // still appears in it — the structural argument the rule rests on does not hold here. Without
    // this guard the rule reports text that took its own advice.
    const FSI = String.fromCodePoint(0x2068);
    const PDI = String.fromCodePoint(0x2069);
    expect(rule.check(snapshotOfOne(`مرحبا السلام ${FSI}Acme Corp.${PDI} كتاب مرحبا`))).toEqual([]);
  });

  it('never reports a run wrapped in the embedding controls either', () => {
    const RLE = String.fromCodePoint(0x202b);
    const PDF = String.fromCodePoint(0x202c);
    expect(rule.check(snapshotOfOne(`مرحبا السلام ${RLE}Acme Corp.${PDF} كتاب مرحبا`))).toEqual([]);
  });

  it('never reports a writing system it does not model', () => {
    expect(rule.check(snapshotOfOne('বাংলা Acme Corp. বাংলা'))).toEqual([]);
  });

  it('never reports text with no letters at all', () => {
    expect(rule.check(snapshotOfOne(SAMPLES.digits))).toEqual([]);
  });
});

describe('unisolated-bidi-run — digits', () => {
  it('reports a numeric run sandwiched beside punctuation', () => {
    // Digits are directionally weak and travel with whatever is next to them, which is why a price
    // or a date inside an Arabic sentence lands in the same trap as a Latin word.
    const violations = rule.check(snapshotOfOne('مرحبا السلام 2024, كتاب مرحبا'));
    expect(violations).toHaveLength(1);
  });
});

describe('unisolated-bidi-run — contract', () => {
  it('declares only right-to-left scripts as affected', () => {
    expect(rule.affectedScripts).toEqual(['arabic', 'hebrew', 'nko', 'syriac', 'thaana']);
  });

  it('admits in its limitations that it reports a risk, not an observation', () => {
    expect(rule.limitations).toContain('not observed reordering');
    expect(rule.description).toContain('decision 014');
  });
});
