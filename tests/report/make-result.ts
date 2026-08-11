/**
 * Scan results for the report tests.
 *
 * The report layer is pure, so its tests need neither a browser nor a scan. What they do need is
 * findings whose shape matches what the real layers produce: the GlyphLint findings below are
 * built by the real `violationFrom` helper against the real rules, so a test can never assert
 * against a violation the rule engine would not have emitted.
 *
 * The axe entries are hand-written, and deliberately carry fields this project never reads
 * (`tags`, `any`/`all`/`none`) — several tests are about those surviving untouched into the JSON.
 */

import { cursiveScriptLetterSpacing } from '../../src/rules/cursive-script-letter-spacing.js';
import { clippedStackedMarks } from '../../src/rules/clipped-stacked-marks.js';
import { violationFrom } from '../../src/rules/helpers.js';
import { textNode } from '../rules/make-snapshot.js';
import type { AxeViolation, ScanResult, Violation } from '../../src/types.js';

/** An axe result carrying everything axe carries, so nothing can quietly be dropped. */
export function makeAxeViolation(overrides: Partial<AxeViolation> = {}): AxeViolation {
  return {
    id: 'image-alt',
    impact: 'critical',
    description: 'Ensure <img> elements have alternative text',
    help: 'Images must have alternative text',
    helpUrl: 'https://dequeuniversity.com/rules/axe/4.12/image-alt',
    tags: ['cat.text-alternatives', 'wcag2a', 'wcag111'],
    nodes: [
      {
        html: '<img src="logo.png">',
        target: ['#logo > img'],
        impact: 'critical',
        any: [{ id: 'has-alt', data: null, relatedNodes: [], impact: 'critical', message: 'x' }],
        all: [],
        none: [],
        failureSummary: 'Fix any of the following: Element does not have an alt attribute',
      },
    ],
    ...overrides,
  };
}

/** A critical GlyphLint finding about Arabic text, produced the way the rule produces it. */
export function makeCursiveViolation(selector = '#arabic'): Violation {
  return violationFrom(
    cursiveScriptLetterSpacing,
    textNode('مرحبا بالعالم', { selector }),
    'arabic',
    {
      whatIsWrong: 'letter-spacing is set to 2px on Arabic text.',
      whyItMatters: 'Arabic is a cursive script: its letters connect.',
      howToFix: 'Remove letter-spacing from this element.',
    },
  );
}

/** A heuristic finding, so the badge and the confidence note have something to render. */
export function makeClippedViolation(selector = '#thai'): Violation {
  return violationFrom(clippedStackedMarks, textNode('ข้อความภาษาไทย', { selector }), 'thai', {
    whatIsWrong: 'Thai text carrying stacked marks is cut off by a container 20px tall.',
    whyItMatters: 'Thai places ink above the line that a Latin-sized box cuts off.',
    howToFix: 'Let the container grow with its content.',
  });
}

export interface ResultOverrides {
  standardViolations?: AxeViolation[];
  scriptAwareViolations?: Violation[];
  passes?: number;
  result?: Partial<ScanResult>;
}

/** A complete `ScanResult`, with both layers populated unless a test asks otherwise. */
export function makeResult(overrides: ResultOverrides = {}): ScanResult {
  return {
    url: 'https://example.com/',
    finalUrl: 'https://example.com/',
    scannedAt: '2026-08-11T10:00:00.000Z',
    durationMs: 1234,
    standard: {
      violations: overrides.standardViolations ?? [makeAxeViolation()],
      passes: overrides.passes ?? 12,
    },
    scriptAware: {
      violations: overrides.scriptAwareViolations ?? [
        makeCursiveViolation(),
        makeClippedViolation(),
      ],
    },
    scriptsDetected: { arabic: 4, thai: 2, latin: 9 },
    ...overrides.result,
  };
}
