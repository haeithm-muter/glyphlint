/**
 * The terminal report.
 *
 * Colour is a parameter, which is what makes this testable at all: nothing here has to pretend to
 * be a TTY, and the plain output can be asserted character by character.
 */

import { describe, expect, it } from 'vitest';

import { buildReportModel } from '../../src/report/model.js';
import { renderTerminalReport } from '../../src/report/terminal.js';
import { makeClippedViolation, makeCursiveViolation, makeResult } from './make-result.js';

/** Any ANSI sequence at all. */
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'u');

function render(options?: Parameters<typeof renderTerminalReport>[1]): string {
  return renderTerminalReport(buildReportModel(makeResult()), options);
}

describe('colour', () => {
  it('emits no escape sequences when colour is off', () => {
    expect(ANSI.test(render())).toBe(false);
    expect(ANSI.test(render({ colour: false }))).toBe(false);
  });

  it('emits them when colour is on', () => {
    expect(ANSI.test(render({ colour: true }))).toBe(true);
  });

  it('says the same thing either way once the sequences are stripped', () => {
    const stripped = render({ colour: true }).replace(
      new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'gu'),
      '',
    );

    expect(stripped).toBe(render({ colour: false }));
  });
});

describe('what it reports', () => {
  it('gives each layer its own heading and its own counts', () => {
    const text = render();

    expect(text).toContain('Standard rules — found by axe-core, reproduced unchanged');
    expect(text).toContain('Script-aware rules — found by GlyphLint');
    expect(text).toContain('Standard rules   (axe-core)');
    expect(text).toContain('Script-aware     (glyphlint)');
  });

  it('names the rule, the element count and the selector', () => {
    const text = render();

    expect(text).toContain('image-alt');
    expect(text).toContain('cursive-script-letter-spacing');
    expect(text).toContain('(1 element)');
    expect(text).toContain('#arabic');
  });

  it('marks a heuristic rule where the reader will see it', () => {
    const text = renderTerminalReport(
      buildReportModel(makeResult({ scriptAwareViolations: [makeClippedViolation()] })),
    );

    expect(text).toContain('[heuristic]');
  });

  it('prints the limitations of each rule', () => {
    expect(render()).toContain('Limits: Judges only spacing the page itself applies');
  });

  it('reproduces axe help text and its documentation link', () => {
    const text = render();

    expect(text).toContain('Images must have alternative text');
    expect(text).toContain('https://dequeuniversity.com/rules/axe/4.12/image-alt');
  });

  it('always ends with the disclaimer', () => {
    expect(render()).toContain('This is an automated scan.');
  });

  it('says so plainly when a layer found nothing', () => {
    const text = renderTerminalReport(
      buildReportModel(makeResult({ standardViolations: [], scriptAwareViolations: [] })),
    );

    expect(text).toContain('axe-core reported no violations.');
    expect(text).toContain('GlyphLint reported no script-aware violations.');
  });

  it('summarises the tail of a long list rather than printing all of it', () => {
    const many = Array.from({ length: 9 }, (_, index) => makeCursiveViolation(`#node-${index}`));
    const text = renderTerminalReport(
      buildReportModel(makeResult({ scriptAwareViolations: many })),
      { maxFindingsPerRule: 3 },
    );

    expect(text).toContain('#node-0');
    expect(text).not.toContain('#node-4');
    expect(text).toContain('… and 6 more elements');
  });

  it('reports a scan that did not complete, rather than an empty page', () => {
    const text = renderTerminalReport(
      buildReportModel(
        makeResult({
          standardViolations: [],
          scriptAwareViolations: [],
          result: { error: { kind: 'timeout', message: 'The page took too long to load.' } },
        }),
      ),
    );

    expect(text).toContain('This scan did not complete: The page took too long to load.');
  });

  it('says what a filter withheld', () => {
    const text = renderTerminalReport(
      buildReportModel(
        makeResult({
          result: {
            filters: {
              applied: { minSeverity: 'serious' },
              withheld: { standard: 4, scriptAware: 2 },
            },
          },
        }),
      ),
    );

    expect(text).toContain('4 axe-core and 2 GlyphLint finding(s) were withheld');
  });

  it('reports text in a writing system it cannot analyse', () => {
    const text = renderTerminalReport(
      buildReportModel(
        makeResult({ result: { unsupportedScript: { nodeCount: 3, samples: ['বাংলা'] } } }),
      ),
    );

    expect(text).toContain('3 text nodes carried a writing system GlyphLint does not model');
    expect(text).toContain('বাংলা');
  });
});
