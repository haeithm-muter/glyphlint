/**
 * The rules, run against snapshots a real browser produced.
 *
 * The rule tests in `tests/rules/` are pure and instant, and they carry one risk: they are built
 * on snapshots written by hand. If a hand-written snapshot holds a value Chromium would never
 * produce — `letter-spacing: 0.12em` where the browser reports `1.92px`, `text-align: left` where
 * it reports `start` — the rules stay green while being wrong about every real page.
 *
 * This file closes that gap. One fixture per rule, loaded in a real browser, scanned by the real
 * scanner, judged by the real rules. It lives under `tests/scanner/` rather than `tests/rules/`
 * on purpose: it needs Chromium, and the promise that `tests/rules/` runs in milliseconds without
 * a browser is worth keeping exact.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { runRules } from '../../src/rules/index.js';
import { scanUrl } from '../../src/scanner/scan.js';
import type { DomSnapshot, Violation } from '../../src/types.js';
import { startFixtureServer, type FixtureServer } from './fixture-server.js';

let server: FixtureServer;

beforeAll(async () => {
  server = await startFixtureServer();
});

afterAll(async () => {
  await server.close();
});

interface Scanned {
  snapshot: DomSnapshot;
  violations: Violation[];
}

/** Scan a fixture and run every rule over what came back. */
async function scan(fixture: string): Promise<Scanned> {
  const result = await scanUrl(server.fixture(fixture));

  expect(result.error).toBeUndefined();
  const snapshot = result.snapshot;
  if (snapshot === undefined) throw new Error(`No snapshot captured for ${fixture}.`);

  return { snapshot, violations: runRules(snapshot) };
}

/** The elements one rule reported, in the order the registry sorted them. */
function flaggedBy(violations: Violation[], ruleId: string): string[] {
  return violations.filter((violation) => violation.ruleId === ruleId).map((v) => v.selector);
}

describe('cursive-script-letter-spacing on a real page', () => {
  it('reports the cursive text and nothing beside it', async () => {
    const { violations } = await scan('cursive-letter-spacing.html');

    // Everything else on that page carries the same letter-spacing declaration: a Hebrew
    // paragraph, a Latin paragraph, a node of digits, and Arabic below the noise floor.
    expect(flaggedBy(violations, 'cursive-script-letter-spacing').sort()).toEqual([
      '#arabic-tracked',
      '#arabic-tracked-em',
      '#syriac-tracked',
    ]);
  });

  it('reports the value the browser resolved, not the one the stylesheet wrote', async () => {
    const { violations } = await scan('cursive-letter-spacing.html');
    const fromEm = violations.find((violation) => violation.selector === '#arabic-tracked-em');

    // The stylesheet says 0.12em. At 16px the reader is looking at 1.92px, and that is the
    // number the finding has to name.
    expect(fromEm?.whatIsWrong).toContain('1.92px');
  });
});

describe('insufficient-line-height-for-script on a real page', () => {
  it('reports the tight paragraphs and leaves the single-line elements alone', async () => {
    const { violations } = await scan('tight-line-height.html');

    expect(flaggedBy(violations, 'insufficient-line-height-for-script').sort()).toEqual([
      '#devanagari-tight',
      '#thai-between',
      '#thai-tight',
    ]);
  });

  it('cites WCAG only where the measured value breaches the number WCAG names', async () => {
    const { violations } = await scan('tight-line-height.html');
    const byId = new Map(violations.map((violation) => [violation.selector, violation]));

    // 1.1 is below the 1.5 SC 1.4.8 names.
    expect(byId.get('#thai-tight')?.wcagRef).toBe('1.4.8');
    // 1.55 clears that and falls short only of our own 1.6 estimate for Thai, so there is no
    // criterion to cite and the finding cites none.
    expect(byId.get('#thai-between')?.wcagRef).toBeUndefined();
    expect(byId.get('#thai-between')?.whatIsWrong).toContain('our own estimate');
  });
});

describe('missing-script-font-coverage on a real page', () => {
  it('reports the scripts whose declared stack is not rendering', async () => {
    const { violations } = await scan('font-coverage.html');
    const flagged = flaggedBy(violations, 'missing-script-font-coverage');

    expect(flagged).toContain('#thai-unloaded');
    expect(flagged).toContain('#devanagari-unloaded');
  });

  it('never reports Latin, whatever the measurement says about it', async () => {
    const { violations } = await scan('font-coverage.html');

    expect(flaggedBy(violations, 'missing-script-font-coverage')).not.toContain('#latin-unloaded');
  });

  it('reports the installed-font control exactly when the probe suspects a fallback', async () => {
    const { snapshot, violations } = await scan('font-coverage.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#thai-installed');
    const flagged = flaggedBy(violations, 'missing-script-font-coverage');

    // Written as an equivalence rather than as "must be clean" on purpose. Whether Arial covers
    // Thai depends on the machine, and asserting an outcome that depends on the installed fonts
    // would be asserting something about this laptop rather than about the rule. What must hold
    // everywhere is that the rule reports exactly what the probe suspected — no more, no less.
    expect(node).toBeDefined();
    expect(flagged.includes('#thai-installed')).toBe(node?.fontProbe.fallbackSuspected);
  });
});

describe('case-transform-on-caseless-script on a real page', () => {
  it('reports the caseless scripts and leaves the bicameral ones alone', async () => {
    const { violations } = await scan('case-transform.html');

    // Latin, Cyrillic and Greek carry the same declaration and are doing exactly what it asks.
    // `full-width` on Han is not a case conversion. The mixed node holds enough Latin for the
    // declaration to have something to act on.
    expect(flaggedBy(violations, 'case-transform-on-caseless-script').sort()).toEqual([
      '#arabic-upper',
      '#hangul-upper',
      '#thai-capitalize',
    ]);
  });
});

describe('the snapshot the rules were given', () => {
  it('is at the version the rules were written against', async () => {
    const { snapshot } = await scan('cursive-letter-spacing.html');

    expect(snapshot.snapshotVersion).toBe(2);
  });

  it('carries the computed values the hand-written test snapshots assume', async () => {
    const { snapshot } = await scan('cursive-letter-spacing.html');
    const clean = snapshot.nodes.find((entry) => entry.selector === '#arabic-clean');

    // These are the defaults in tests/rules/make-snapshot.ts. If Chromium ever stops agreeing
    // with them, the pure tests are testing a browser that does not exist and this fails first.
    expect(clean?.css.letterSpacing).toBe('normal');
    expect(clean?.css.lineHeight).toBe('normal');
    expect(clean?.css.textAlign).toBe('start');
    expect(clean?.css.textTransform).toBe('none');
    expect(clean?.css.transform).toBe('none');
    expect(clean?.css.webkitLineClamp).toBe('none');
    expect(clean?.unicodeBidi).toBe('isolate');
  });
});
