/**
 * Narrowing axe-core's findings.
 *
 * No browser here: `filter.ts` is a pure function and is tested as one. The fixtures below are
 * hand-written axe results, and the fields they carry are the fields axe's own type declares.
 *
 * What these tests are really guarding is decision 018. The filter is allowed to withhold an axe
 * finding; it is never allowed to change one. Every assertion about a surviving entry is an
 * identity check against the object that went in.
 */

import { describe, expect, it } from 'vitest';

import { filterAxeViolations, hasAnyFilter } from '../../src/scanner/filter.js';
import type { AxeViolation } from '../../src/types.js';

/** A minimal axe result. Only the fields a filter reads are given values worth reading. */
function axeViolation(id: string, impact: AxeViolation['impact']): AxeViolation {
  return {
    id,
    impact,
    description: `axe description for ${id}`,
    help: `axe help for ${id}`,
    helpUrl: `https://dequeuniversity.com/rules/axe/4.12/${id}`,
    tags: ['cat.text-alternatives', 'wcag2a'],
    nodes: [{ html: '<img src="x">', target: ['img'], any: [], all: [], none: [] }],
  };
}

const CRITICAL = axeViolation('image-alt', 'critical');
const MODERATE = axeViolation('region', 'moderate');
const UNGRADED = axeViolation('frame-tested', undefined);

describe('hasAnyFilter', () => {
  it('is false for the default, empty options', () => {
    expect(hasAnyFilter({})).toBe(false);
  });

  it('is true for each option on its own', () => {
    expect(hasAnyFilter({ onlyRules: [] })).toBe(true);
    expect(hasAnyFilter({ disabledRules: [] })).toBe(true);
    expect(hasAnyFilter({ onlyScripts: [] })).toBe(true);
    expect(hasAnyFilter({ minSeverity: 'minor' })).toBe(true);
  });
});

describe('filterAxeViolations', () => {
  it('returns every finding unchanged when no filter is set', () => {
    const input = [CRITICAL, MODERATE];
    const output = filterAxeViolations(input, {});

    expect(output).toEqual(input);
    // Identity, not equality: a survivor is the object axe produced, not a copy of it.
    expect(output[0]).toBe(CRITICAL);
    expect(output[1]).toBe(MODERATE);
  });

  it('drops findings graded below the floor and keeps the rest identical', () => {
    const output = filterAxeViolations([CRITICAL, MODERATE], { minSeverity: 'serious' });

    expect(output).toHaveLength(1);
    expect(output[0]).toBe(CRITICAL);
  });

  it('keeps a finding axe did not grade, whatever the floor', () => {
    // axe leaves `impact` off when it did not grade the failure. Dropping such a finding would
    // mean inventing a grade for it in order to decide it was not serious enough to show.
    const output = filterAxeViolations([UNGRADED], { minSeverity: 'critical' });

    expect(output).toEqual([UNGRADED]);
  });

  it('reads the deny-list against axe rule ids', () => {
    const output = filterAxeViolations([CRITICAL, MODERATE], { disabledRules: ['image-alt'] });

    expect(output.map((violation) => violation.id)).toEqual(['region']);
  });

  it('reads the allow-list against axe rule ids', () => {
    const output = filterAxeViolations([CRITICAL, MODERATE], { onlyRules: ['region'] });

    expect(output.map((violation) => violation.id)).toEqual(['region']);
  });

  it('withholds every axe finding when the allow-list names only GlyphLint rules', () => {
    // The consequence the CLI has to warn about: "only this rule" means the same thing on both
    // sides of the report, and on the axe side that means nothing survives.
    const output = filterAxeViolations([CRITICAL, MODERATE], {
      onlyRules: ['cursive-script-letter-spacing'],
    });

    expect(output).toEqual([]);
  });

  it('lets the deny-list win over the allow-list', () => {
    const output = filterAxeViolations([CRITICAL, MODERATE], {
      onlyRules: ['image-alt', 'region'],
      disabledRules: ['image-alt'],
    });

    expect(output.map((violation) => violation.id)).toEqual(['region']);
  });

  it('ignores a script filter, which axe findings carry nothing to answer', () => {
    const output = filterAxeViolations([CRITICAL, MODERATE], { onlyScripts: ['arabic'] });

    expect(output).toEqual([CRITICAL, MODERATE]);
  });
});
