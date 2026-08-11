/**
 * GlyphLint scanning its own report.
 *
 * An accessibility tool whose output is inaccessible refutes itself, so this is a permanent gate
 * rather than a check somebody once did. The report is generated from a fixture that gives both
 * layers something to say, served over a real origin, and scanned by the real scanner and the real
 * rules. Anything either layer reports fails the build.
 *
 * The audit is run in both directions. The report chrome is English and reads left to right, but
 * the brief requires it to render correctly right to left as well, and the only honest way to keep
 * that promise is to produce that version and scan it. Every declaration in the stylesheet is
 * logical rather than physical, so the flip is a single attribute — and if anyone ever writes
 * `margin-left` into it, `physical-css-in-bidi-context` reports us here first.
 *
 * Two findings were fixed because of this test, and both were real:
 *
 * - `scrollable-region-focusable`, from axe: a markup snippet wide enough to scroll was not
 *   reachable by keyboard.
 * - `missing-script-font-coverage`, from our own layer: quoted Thai text was set in a monospace
 *   stack that cannot render it, so the browser was substituting a font silently. The report was
 *   committing the exact defect the rule exists to report.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildReportModel, renderHtmlReport } from '../../src/report/index.js';
import { scanUrl } from '../../src/scanner/scan.js';
import type { ScanResult } from '../../src/types.js';
import { startFixtureServer, type FixtureServer } from './fixture-server.js';

let server: FixtureServer;
/** The scan the report is built from. */
let source: ScanResult;
/** The report itself, scanned in each direction. Taken once: every scan is a real page load. */
let auditLtr: ScanResult;
let auditRtl: ScanResult;

/** Render the report, serve it, and scan what a browser actually makes of it. */
async function auditReport(name: string, dir: 'ltr' | 'rtl'): Promise<ScanResult> {
  const html = renderHtmlReport(buildReportModel(source), { documentDir: dir });
  return scanUrl(server.serveHtml(name, html));
}

beforeAll(async () => {
  server = await startFixtureServer();
  source = await scanUrl(server.fixture('report-source.html'));
  auditLtr = await auditReport('report-ltr.html', 'ltr');
  auditRtl = await auditReport('report-rtl.html', 'rtl');
}, 180_000);

afterAll(async () => {
  await server.close();
});

describe('the page the report is built from', () => {
  it('gives both layers something to report', () => {
    // Without this, the audit below could pass by auditing an empty report — which would prove
    // that a page with nothing on it is accessible, and nothing else.
    expect(source.error).toBeUndefined();
    expect(source.standard.violations.length).toBeGreaterThan(0);
    expect(source.scriptAware.violations.length).toBeGreaterThan(0);
  });

  it('puts non-Latin text into the snippet axe-core quotes', () => {
    // The path that broke the first version of the stylesheet: axe quotes the failing element's
    // markup, and that markup can contain any writing system.
    const markup = source.standard.violations.flatMap((violation) =>
      violation.nodes.map((node) => node.html),
    );

    expect(markup.some((html) => /\p{Script=Arabic}/u.test(html))).toBe(true);
  });
});

describe('the report, scanned by GlyphLint', () => {
  it('passes axe-core with no violations, left to right', () => {
    // Mapped to rule ids rather than asserted as an empty array of objects: when this fails, the
    // message names the rule instead of printing a page of axe internals.
    expect(auditLtr.error).toBeUndefined();
    expect(auditLtr.standard.violations.map((violation) => violation.id)).toEqual([]);
    expect(auditLtr.standard.passes).toBeGreaterThan(0);
  });

  it('passes its own script-aware rules, left to right', () => {
    expect(auditLtr.scriptAware.violations.map((violation) => violation.ruleId)).toEqual([]);
  });

  it('passes both layers when rendered right to left', () => {
    expect(auditRtl.error).toBeUndefined();
    expect(auditRtl.standard.violations.map((violation) => violation.id)).toEqual([]);
    expect(auditRtl.scriptAware.violations.map((violation) => violation.ruleId)).toEqual([]);
  });

  it('reads the quoted text as the writing systems it is in', () => {
    // The report is `lang="en"` and full of Arabic, Hebrew and Thai excerpts. Their presence is
    // what makes the audit above worth running: a report that quoted nothing would pass every
    // script-aware rule by having no script in it.
    const scripts = new Set(auditLtr.snapshot?.nodes.map((node) => node.dominantScript) ?? []);

    expect(scripts.has('arabic')).toBe(true);
    expect(scripts.has('hebrew')).toBe(true);
    expect(scripts.has('thai')).toBe(true);
  });
});
