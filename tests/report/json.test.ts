/**
 * The JSON report.
 *
 * Two properties are load-bearing and everything else is detail: every finding says where it came
 * from, and an axe finding arrives with everything axe put in it. The campaign runner aggregates
 * these files, so a field lost here is a number wrong three stages later.
 */

import { describe, expect, it } from 'vitest';

import { buildJsonReport, renderJsonReport } from '../../src/report/json.js';
import { buildReportModel } from '../../src/report/model.js';
import { makeAxeViolation, makeClippedViolation, makeResult } from './make-result.js';

function report(): ReturnType<typeof buildJsonReport> {
  return buildJsonReport(buildReportModel(makeResult()));
}

describe('every entry says where it came from', () => {
  it('labels axe findings with their source', () => {
    for (const finding of report().standard.findings) {
      expect(finding.source).toBe('axe-core');
    }
  });

  it('labels GlyphLint findings with theirs', () => {
    for (const finding of report().scriptAware.findings) {
      expect(finding.source).toBe('glyphlint');
    }
  });

  it('labels the sections too, so a consumer cannot mix them by accident', () => {
    expect(report().standard.source).toBe('axe-core');
    expect(report().scriptAware.source).toBe('glyphlint');
  });

  it('states in prose that the standard findings are not ours', () => {
    expect(report().standard.attribution).toContain('axe-core');
    expect(report().standard.attribution).toContain('does not claim them as its own');
  });
});

describe('axe findings survive intact', () => {
  it('keeps every field axe wrote, including the ones we never read', () => {
    const axe = makeAxeViolation();
    const finding = buildJsonReport(
      buildReportModel(makeResult({ standardViolations: [axe] })),
    ).standard.findings[0];

    // Compared against the original object rather than against a list of fields: a test that
    // enumerates the fields it expects cannot notice the one axe adds next year.
    expect(finding).toEqual({ source: 'axe-core', ...axe });
    expect(finding?.nodes[0]?.any).toEqual(axe.nodes[0]?.any);
    expect(finding?.nodes[0]?.failureSummary).toBe(axe.nodes[0]?.failureSummary);
  });

  it('does not modify the object it was given', () => {
    const axe = makeAxeViolation();
    const before = JSON.stringify(axe);

    buildJsonReport(buildReportModel(makeResult({ standardViolations: [axe] })));

    // The label is added to a copy. The scan result a caller holds is still exactly what axe
    // produced, which matters because the campaign runner keeps both.
    expect(JSON.stringify(axe)).toBe(before);
    expect('source' in axe).toBe(false);
  });
});

describe('the summary', () => {
  it('counts the two layers separately', () => {
    const summary = report().summary;

    expect(summary.standard.total).toBe(1);
    expect(summary.standard.passes).toBe(12);
    expect(summary.scriptAware.total).toBe(2);
    expect(summary.byScript).toEqual([
      { script: 'arabic', label: 'Arabic', count: 1 },
      { script: 'thai', label: 'Thai', count: 1 },
    ]);
  });

  it('carries per-rule confidence and limitations for our own findings', () => {
    const rules = buildJsonReport(
      buildReportModel(makeResult({ scriptAwareViolations: [makeClippedViolation()] })),
    ).scriptAware.rules;

    expect(rules[0]?.confidence).toBe('heuristic');
    expect(rules[0]?.limitations).not.toBe('');
  });
});

describe('the document as text', () => {
  it('is valid JSON, ends with a newline, and always carries the disclaimer', () => {
    const text = renderJsonReport(buildReportModel(makeResult()));

    expect(text.endsWith('\n')).toBe(true);
    const parsed: unknown = JSON.parse(text);
    expect((parsed as { disclaimer: string }).disclaimer).toContain('automated scan');
    expect((parsed as { tool: string }).tool).toBe('glyphlint');
  });

  it('serialises identically twice', () => {
    const model = buildReportModel(makeResult());

    expect(renderJsonReport(model)).toBe(renderJsonReport(model));
  });
});
