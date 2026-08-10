import { describe, expect, it } from 'vitest';

import { RULES, runRules } from '../../src/rules/index.js';
import { SAMPLES, snapshotOf, snapshotOfOne, textNode } from './make-snapshot.js';

/**
 * Two nodes that between them trip all four Group A rules and nothing else.
 *
 * The Arabic node declares `dir` so that the direction rules stay out of this fixture: it exists
 * to test ordering and filtering, and it can only do that if the set of findings is known exactly.
 */
const MIXED_PAGE = snapshotOf([
  textNode(SAMPLES.arabicLong, {
    selector: '#arabic',
    ownDir: 'rtl',
    css: { letterSpacing: '2px', textTransform: 'uppercase' },
  }),
  textNode(SAMPLES.thaiLong, {
    selector: '#thai',
    css: { lineHeight: '17.6px', fontSize: '16px' },
    box: { clientHeight: 80, scrollHeight: 80 },
    fontProbe: { declaredStack: ['Noto Sans Thai'], renderedFamily: null, fallbackSuspected: true },
  }),
]);

describe('the registry', () => {
  it('holds every rule exactly once', () => {
    const ids = RULES.map((rule) => rule.id);

    expect(ids).toEqual([
      // Group A — script integrity.
      'cursive-script-letter-spacing',
      'insufficient-line-height-for-script',
      'missing-script-font-coverage',
      'case-transform-on-caseless-script',
      // Group B — direction and layout.
      'missing-dir-attribute',
      'lang-script-mismatch',
      'physical-css-in-bidi-context',
      'unisolated-bidi-run',
      'unmirrored-directional-icon',
    ]);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every rule the things the report renders', () => {
    for (const rule of RULES) {
      expect(rule.id).toMatch(/^[a-z][a-z0-9-]*$/u);
      expect(rule.title).not.toBe('');
      expect(rule.description).not.toBe('');
      // Rendered verbatim in the report: it is the sentence that tells a reader when not to
      // believe this rule, so a rule without one is not finished.
      expect(rule.limitations).not.toBe('');
      expect(['high', 'medium', 'heuristic']).toContain(rule.confidence);
      expect(['critical', 'serious', 'moderate', 'minor']).toContain(rule.severity);
    }
  });

  it('says nothing about a page with no text', () => {
    expect(runRules(snapshotOf([]))).toEqual([]);
  });

  it('says nothing about a clean page', () => {
    expect(runRules(snapshotOfOne(SAMPLES.arabicLong, { ownDir: 'rtl' }))).toEqual([]);
  });
});

describe('severity belongs to the finding, not to the rule', () => {
  // `missing-dir-attribute` declares itself serious and grades one of its own cases moderate: text
  // laid out right-to-left by CSS with no dir attribute anywhere. Filtering on the rule rather than
  // on the finding would let that moderate finding through a `serious` filter — see decision 012.
  const CSS_ONLY_DIRECTION = snapshotOfOne(SAMPLES.arabicLong, {
    computedDirection: 'rtl',
    css: { direction: 'rtl' },
  });

  it('produces the reduced finding from a rule that declares itself serious', () => {
    const violations = runRules(CSS_ONLY_DIRECTION);

    expect(violations).toHaveLength(1);
    expect(violations[0]?.ruleId).toBe('missing-dir-attribute');
    expect(violations[0]?.severity).toBe('moderate');
  });

  it('filters that finding out at minSeverity: serious', () => {
    expect(runRules(CSS_ONLY_DIRECTION, { minSeverity: 'serious' })).toEqual([]);
  });

  it('keeps it at minSeverity: moderate', () => {
    expect(runRules(CSS_ONLY_DIRECTION, { minSeverity: 'moderate' })).toHaveLength(1);
  });
});

describe('deterministic ordering', () => {
  it('sorts by severity first', () => {
    const violations = runRules(MIXED_PAGE);

    expect(violations.map((violation) => violation.severity)).toEqual([
      'critical',
      'serious',
      'moderate',
      'minor',
    ]);
  });

  it('sorts by selector within one rule', () => {
    const snapshot = snapshotOf([
      textNode(SAMPLES.arabic, { selector: '#z-last', css: { letterSpacing: '2px' } }),
      textNode(SAMPLES.arabic, { selector: '#a-first', css: { letterSpacing: '2px' } }),
    ]);

    expect(runRules(snapshot).map((violation) => violation.selector)).toEqual([
      '#a-first',
      '#z-last',
    ]);
  });

  it('produces byte-identical output on a second run', () => {
    // The property the campaign layer depends on: a report that reorders itself between two runs
    // of the same page cannot be diffed, and a diff is the only way to show anything improved.
    expect(JSON.stringify(runRules(MIXED_PAGE))).toBe(JSON.stringify(runRules(MIXED_PAGE)));
  });

  it('does not depend on the order the nodes were captured in', () => {
    const forwards = runRules(MIXED_PAGE);
    const backwards = runRules(snapshotOf([...MIXED_PAGE.nodes].reverse()));

    expect(JSON.stringify(backwards)).toBe(JSON.stringify(forwards));
  });
});

describe('runRules options', () => {
  it('leaves out the rules it is told to', () => {
    const violations = runRules(MIXED_PAGE, {
      disabledRules: ['cursive-script-letter-spacing', 'case-transform-on-caseless-script'],
    });

    expect(violations.map((violation) => violation.ruleId)).toEqual([
      'missing-script-font-coverage',
      'insufficient-line-height-for-script',
    ]);
  });

  it('keeps only findings at or above a severity', () => {
    const violations = runRules(MIXED_PAGE, { minSeverity: 'serious' });

    expect(violations.map((violation) => violation.severity)).toEqual(['critical', 'serious']);
  });

  it('keeps only findings about the writing systems asked for', () => {
    const violations = runRules(MIXED_PAGE, { onlyScripts: ['thai'] });

    expect(violations.length).toBeGreaterThan(0);
    for (const violation of violations) {
      expect(violation.script).toBe('thai');
    }
  });

  it('treats an empty options object as no filtering', () => {
    expect(runRules(MIXED_PAGE, {})).toEqual(runRules(MIXED_PAGE));
  });
});

describe('the separation from axe-core', () => {
  it('labels every finding as ours, never as axe', () => {
    // The claim the whole project rests on. If this ever fails, the report can no longer show
    // what the script-aware layer added over the standard audit.
    for (const violation of runRules(MIXED_PAGE)) {
      expect(violation.source).toBe('glyphlint');
    }
  });
});
