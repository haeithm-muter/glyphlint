/**
 * The report model.
 *
 * Most of these tests are about one property: the two layers are counted, grouped and carried
 * separately, and nothing in the model adds them together. The rest are about axe's entries
 * arriving on the far side unchanged.
 */

import { describe, expect, it } from 'vitest';

import { buildReportModel } from '../../src/report/model.js';
import { makeAxeViolation, makeClippedViolation, makeCursiveViolation, makeResult } from './make-result.js';

describe('the two layers stay apart', () => {
  it('counts each side on its own, with no combined total anywhere', () => {
    const model = buildReportModel(makeResult());

    expect(model.standard.counts.critical).toBe(1);
    expect(model.standard.counts.total).toBe(1);
    expect(model.scriptAware.counts.critical).toBe(1);
    expect(model.scriptAware.counts.moderate).toBe(1);
    expect(model.scriptAware.counts.total).toBe(2);

    // The property this whole project rests on, asserted as a shape rather than as a comment:
    // there is no key at the top of the model where a combined number could live.
    expect(Object.keys(model)).not.toContain('counts');
    expect(Object.keys(model)).not.toContain('total');
  });

  it('labels each section with its own source', () => {
    const model = buildReportModel(makeResult());

    expect(model.standard.source).toBe('axe-core');
    expect(model.scriptAware.source).toBe('glyphlint');
  });
});

describe('the standard section', () => {
  it('carries axe entries through by reference, unchanged', () => {
    const axe = makeAxeViolation();
    const model = buildReportModel(makeResult({ standardViolations: [axe] }));

    // Identity: the report holds axe's object, not a version of it we assembled.
    expect(model.standard.groups[0]?.axe).toBe(axe);
    expect(model.standard.groups[0]?.axe.tags).toEqual(['cat.text-alternatives', 'wcag2a', 'wcag111']);
  });

  it('counts elements, not just rules', () => {
    const axe = makeAxeViolation({
      nodes: [
        { html: '<img>', target: ['#a'], any: [], all: [], none: [] },
        { html: '<img>', target: ['#b'], any: [], all: [], none: [] },
      ],
    });
    const model = buildReportModel(makeResult({ standardViolations: [axe] }));

    expect(model.standard.ruleCount).toBe(1);
    expect(model.standard.elementCount).toBe(2);
  });

  it('puts an ungraded axe finding in its own bucket rather than in minor', () => {
    const model = buildReportModel(
      makeResult({ standardViolations: [makeAxeViolation({ impact: undefined })] }),
    );

    expect(model.standard.counts.ungraded).toBe(1);
    expect(model.standard.counts.minor).toBe(0);
  });

  it('orders rules worst first, and ungraded last', () => {
    const model = buildReportModel(
      makeResult({
        standardViolations: [
          makeAxeViolation({ id: 'nothing-graded', impact: undefined }),
          makeAxeViolation({ id: 'a-moderate-one', impact: 'moderate' }),
          makeAxeViolation({ id: 'a-critical-one', impact: 'critical' }),
        ],
      }),
    );

    expect(model.standard.groups.map((group) => group.axe.id)).toEqual([
      'a-critical-one',
      'a-moderate-one',
      'nothing-graded',
    ]);
  });

  it('reports the number of passing checks axe itself counted', () => {
    const model = buildReportModel(makeResult({ passes: 41 }));

    expect(model.standard.passes).toBe(41);
  });
});

describe('the script-aware section', () => {
  it('groups findings by rule and joins the registry metadata onto them', () => {
    const model = buildReportModel(
      makeResult({
        scriptAwareViolations: [makeCursiveViolation('#one'), makeCursiveViolation('#two')],
      }),
    );

    const group = model.scriptAware.groups[0];
    expect(model.scriptAware.groups).toHaveLength(1);
    expect(group?.elementCount).toBe(2);
    // Pulled from the rule, not from the finding: this is the sentence the report must show
    // beside every group, and no violation carries it.
    expect(group?.limitations).toContain('Judges only spacing the page itself applies');
    expect(group?.description).not.toBe('');
  });

  it('marks a group heuristic when its rule is', () => {
    const model = buildReportModel(
      makeResult({ scriptAwareViolations: [makeClippedViolation()] }),
    );

    expect(model.scriptAware.groups[0]?.confidence).toBe('heuristic');
    expect(model.scriptAware.hasHeuristicFindings).toBe(true);
  });

  it('says so when nothing heuristic was found', () => {
    const model = buildReportModel(
      makeResult({ scriptAwareViolations: [makeCursiveViolation()] }),
    );

    expect(model.scriptAware.hasHeuristicFindings).toBe(false);
  });

  it('counts findings by writing system', () => {
    const model = buildReportModel(
      makeResult({
        scriptAwareViolations: [
          makeCursiveViolation('#one'),
          makeCursiveViolation('#two'),
          makeClippedViolation(),
        ],
      }),
    );

    expect(model.scriptAware.byScript).toEqual([
      { script: 'arabic', label: 'Arabic', count: 2 },
      { script: 'thai', label: 'Thai', count: 1 },
    ]);
  });

  it('lists the writing systems the page contained, whether or not anything was wrong', () => {
    const model = buildReportModel(makeResult());

    expect(model.scriptsDetected).toEqual([
      { script: 'latin', label: 'Latin', count: 9 },
      { script: 'arabic', label: 'Arabic', count: 4 },
      { script: 'thai', label: 'Thai', count: 2 },
    ]);
  });

  it('takes the worst severity among the findings, not the one the rule declares', () => {
    // Decision 012: a rule may grade one of its own findings below its declaration, so the group
    // heading has to describe the findings rather than the registry entry.
    const critical = makeCursiveViolation('#one');
    const lowered = { ...makeCursiveViolation('#two'), severity: 'minor' as const };
    const model = buildReportModel(makeResult({ scriptAwareViolations: [lowered, critical] }));

    expect(model.scriptAware.groups[0]?.severity).toBe('critical');
    expect(model.scriptAware.counts.critical).toBe(1);
    expect(model.scriptAware.counts.minor).toBe(1);
  });
});

describe('what the model carries through', () => {
  it('keeps the filter report when the run was narrowed', () => {
    const model = buildReportModel(
      makeResult({
        result: {
          filters: {
            applied: { minSeverity: 'serious' },
            withheld: { standard: 3, scriptAware: 1 },
          },
        },
      }),
    );

    expect(model.filters?.withheld.standard).toBe(3);
  });

  it('leaves filters out entirely when nothing was narrowed', () => {
    expect(buildReportModel(makeResult()).filters).toBeUndefined();
  });

  it('keeps the unsupported-script report and the scan error', () => {
    const model = buildReportModel(
      makeResult({
        result: {
          unsupportedScript: { nodeCount: 2, samples: ['বাংলা'] },
          error: { kind: 'timeout', message: 'The page took too long to load.' },
        },
      }),
    );

    expect(model.unsupportedScript?.nodeCount).toBe(2);
    expect(model.error?.kind).toBe('timeout');
  });

  it('produces the same model twice for the same result', () => {
    // Purity, asserted rather than assumed: a report regenerated from a stored result has to be
    // comparable with the original, and that is only true if nothing here reads a clock.
    const result = makeResult();

    expect(buildReportModel(result)).toEqual(buildReportModel(result));
  });
});
