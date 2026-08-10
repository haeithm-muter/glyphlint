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

describe('missing-dir-attribute on a real page', () => {
  it('reports the undeclared right-to-left text and nothing that declared itself', async () => {
    const { violations } = await scan('missing-dir.html');

    expect(flaggedBy(violations, 'missing-dir-attribute').sort()).toEqual([
      '#arabic-css-only',
      '#arabic-undeclared',
      '#hebrew-undeclared',
    ]);
  });

  it('grades CSS-only direction below a missing declaration', async () => {
    const { violations } = await scan('missing-dir.html');
    const byId = new Map(violations.map((violation) => [violation.selector, violation]));

    expect(byId.get('#arabic-undeclared')?.severity).toBe('serious');
    expect(byId.get('#arabic-css-only')?.severity).toBe('moderate');
  });

  it('accepts dir="auto" on an ancestor, which resolves to rtl here', async () => {
    const { snapshot, violations } = await scan('missing-dir.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#arabic-auto');

    // The measured trap this field was added for: the text is laid out right-to-left and the
    // markup is correct. Seeing only `dir="rtl"` would report a page that did the right thing.
    expect(node?.computedDirection).toBe('rtl');
    expect(node?.inheritedDir).toBe('auto');
    expect(flaggedBy(violations, 'missing-dir-attribute')).not.toContain('#arabic-auto');
  });
});

describe('lang-script-mismatch on a real page', () => {
  it('reports the mismatches and none of the languages that only look wrong', async () => {
    const { violations } = await scan('lang-script-mismatch.html');

    // Persian in Arabic script, Japanese and Korean in Han, Vietnamese in Latin, and Serbian
    // under an explicit Latn subtag are all correct markup and all on this page.
    expect(flaggedBy(violations, 'lang-script-mismatch').sort()).toEqual([
      '#arabic-under-en',
      '#thai-under-en',
    ]);
  });

  it('leaves a syntax-highlighted code span alone', async () => {
    const { snapshot, violations } = await scan('lang-script-mismatch.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#code-token');

    // The shape a tag-name test would miss: the element is a span, and only its ancestry says
    // the content is code.
    expect(node?.tagName).toBe('SPAN');
    expect(node?.hasCodeAncestor).toBe(true);
    expect(flaggedBy(violations, 'lang-script-mismatch')).not.toContain('#code-token');
  });
});

describe('physical-css-in-bidi-context on a real page', () => {
  it('reports the physical alignments and nothing else on the page', async () => {
    const { violations } = await scan('physical-css-rtl.html');

    expect(flaggedBy(violations, 'physical-css-in-bidi-context').sort()).toEqual([
      '#rtl-align-left',
      '#rtl-align-right',
    ]);
  });

  it('proves why margins are absent: the fix computes identically to the defect', async () => {
    const { snapshot, violations } = await scan('physical-css-rtl.html');
    const byId = new Map(snapshot.nodes.map((entry) => [entry.selector, entry]));

    // The measurement that removed half of this rule. `margin-right: 40px` was written on one of
    // these and `margin-inline-start: 40px` on the other; in a right-to-left context start *is*
    // right, so the two arrive at a rule as the same numbers. There is nothing here to key on.
    const physical = byId.get('#rtl-margin-right');
    const logical = byId.get('#rtl-margin-logical');
    expect(physical?.css.marginRight).toBe('40px');
    expect(physical?.css.marginRight).toBe(logical?.css.marginRight);
    expect(physical?.css.marginLeft).toBe(logical?.css.marginLeft);

    // So none of them is reported. Reporting the physical one would report the logical one, and
    // the logical one is the correct code this rule would otherwise be recommending — decision 013.
    const flagged = flaggedBy(violations, 'physical-css-in-bidi-context');
    expect(flagged).not.toContain('#rtl-margin-right');
    expect(flagged).not.toContain('#rtl-margin-logical');
    expect(flagged).not.toContain('#rtl-margin-left');
  });

  it('leaves the browser stylesheet and the centring idiom alone', async () => {
    const { snapshot, violations } = await scan('physical-css-rtl.html');
    const flagged = flaggedBy(violations, 'physical-css-in-bidi-context');
    const button = snapshot.nodes.find((entry) => entry.selector === '#rtl-button');

    expect(button?.css.paddingLeft).toBe('6px');
    expect(flagged).not.toContain('#rtl-button');
    expect(flagged).not.toContain('#rtl-centred');
    expect(flagged).not.toContain('#rtl-list-item');
  });
});

describe('unisolated-bidi-run on a real page', () => {
  it('reports only the sandwiched runs that touch punctuation', async () => {
    const { violations } = await scan('unisolated-bidi.html');

    // The bare Latin run, the trailing run and the properly isolated one are all on this page.
    expect(flaggedBy(violations, 'unisolated-bidi-run').sort()).toEqual([
      '#digit-run-punctuated',
      '#latin-run-punctuated',
    ]);
  });

  it('fires despite every paragraph computing unicode-bidi: isolate', async () => {
    const { snapshot, violations } = await scan('unisolated-bidi.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#latin-run-punctuated');

    // The measured finding that forced this rule to be rebuilt: Chromium puts
    // `unicode-bidi: isolate` on every block element from its own stylesheet. A rule that skipped
    // isolated elements, as the specification proposed, would be silent on every paragraph.
    expect(node?.unicodeBidi).toBe('isolate');
    expect(flaggedBy(violations, 'unisolated-bidi-run')).toContain('#latin-run-punctuated');
  });

  it('is silenced by a bdi that actually wraps the run', async () => {
    const { violations } = await scan('unisolated-bidi.html');

    expect(flaggedBy(violations, 'unisolated-bidi-run')).not.toContain('#latin-run-isolated');
  });
});

describe('unmirrored-directional-icon on a real page', () => {
  it('reports the arrows nothing turned around', async () => {
    const { violations } = await scan('directional-icon.html');
    const flagged = flaggedBy(violations, 'unmirrored-directional-icon');

    expect(flagged).toContain('#arrow-plain');
    expect(flagged).toContain('#arrow-classed');
  });

  it('credits every form of mirroring the browser resolves to a matrix', async () => {
    const { snapshot, violations } = await scan('directional-icon.html');
    const flagged = flaggedBy(violations, 'unmirrored-directional-icon');
    const byId = new Map(snapshot.nodes.map((entry) => [entry.selector, entry]));

    // scaleX(-1) and rotate(180deg) both arrive as matrices, and the wrapper case arrives with
    // `transform: none` on the element that holds the text.
    expect(byId.get('#arrow-mirrored')?.css.transform).toBe('matrix(-1, 0, 0, 1, 0, 0)');
    expect(byId.get('#arrow-turned')?.css.transform).toBe('matrix(-1, 0, 0, -1, 0, 0)');
    expect(byId.get('#arrow-wrapped')?.hasTransformedAncestor).toBe(true);

    for (const selector of ['#arrow-mirrored', '#arrow-turned', '#arrow-wrapped']) {
      expect(flagged).not.toContain(selector);
    }
  });

  it('does not credit a transform that leaves the arrow pointing where it was', async () => {
    const { violations } = await scan('directional-icon.html');

    expect(flaggedBy(violations, 'unmirrored-directional-icon')).toContain('#arrow-nudged');
  });

  it('never reports vertical arrows or a layout class', async () => {
    const { violations } = await scan('directional-icon.html');
    const flagged = flaggedBy(violations, 'unmirrored-directional-icon');

    expect(flagged).not.toContain('#arrow-vertical');
    expect(flagged).not.toContain('#layout-class');
  });
});

describe('unsafe-word-break-for-script on a real page', () => {
  it('reports each pairing the writing system cannot take', async () => {
    const { violations } = await scan('word-break.html');

    expect(flaggedBy(violations, 'unsafe-word-break-for-script').sort()).toEqual([
      '#arabic-break-all',
      '#han-hyphens',
      '#khmer-break-all',
      '#syriac-hyphens',
      '#thai-break-all',
    ]);
  });

  it('leaves break-all on Han alone, where it is ordinary rather than a defect', async () => {
    const { snapshot, violations } = await scan('word-break.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#han-break-all');

    // The declaration really is there, and it is still not reported: Han breaks between characters
    // as a matter of course. This is the pairing the property table exists to get right.
    expect(node?.css.wordBreak).toBe('break-all');
    expect(flaggedBy(violations, 'unsafe-word-break-for-script')).not.toContain('#han-break-all');
  });

  it('reads the computed keywords the browser really reports', async () => {
    const { snapshot } = await scan('word-break.html');
    const byId = new Map(snapshot.nodes.map((entry) => [entry.selector, entry]));

    // No resolution, no normalisation: these arrive exactly as written, which is what makes the
    // rule a keyword comparison rather than a guess.
    expect(byId.get('#arabic-default')?.css.wordBreak).toBe('normal');
    expect(byId.get('#arabic-default')?.css.hyphens).toBe('manual');
    expect(byId.get('#arabic-keep-all')?.css.wordBreak).toBe('keep-all');
    expect(byId.get('#syriac-hyphens')?.css.hyphens).toBe('auto');
  });
});

describe('clipped-stacked-marks on a real page', () => {
  it('reports the stacked-mark text its container is cutting off', async () => {
    const { violations } = await scan('clipped-marks.html');

    expect(flaggedBy(violations, 'clipped-stacked-marks').sort()).toEqual([
      '#devanagari-clipped',
      '#thai-clamped',
      '#thai-clipped',
      '#thai-shorter-than-line',
      '#vietnamese-clipped',
    ]);
  });

  it('catches a line clamp, which measures as an overflow after all', async () => {
    const { snapshot } = await scan('clipped-marks.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#thai-clamped');

    // Worth asserting because the first measurement of this suggested the opposite: a clamped box
    // whose content does not actually overflow reports equal heights, and it was the fixture that
    // was wrong rather than the condition.
    expect(node?.css.webkitLineClamp).toBe('2');
    expect(node?.box.scrollHeight).toBeGreaterThan(node?.box.clientHeight ?? 0);
  });

  it('never reports text that overflows a box which does not hide it', async () => {
    const { snapshot, violations } = await scan('clipped-marks.html');
    const node = snapshot.nodes.find((entry) => entry.selector === '#thai-visible');

    // The content is taller than the box and all of it is on the screen. Nothing was taken away.
    expect(node?.box.scrollHeight).toBeGreaterThan(node?.box.clientHeight ?? 0);
    expect(node?.css.overflowY).toBe('visible');
    expect(flaggedBy(violations, 'clipped-stacked-marks')).not.toContain('#thai-visible');
  });

  it('never reports a scrollable box or a roomy one', async () => {
    const { violations } = await scan('clipped-marks.html');
    const flagged = flaggedBy(violations, 'clipped-stacked-marks');

    expect(flagged).not.toContain('#thai-scrollable');
    expect(flagged).not.toContain('#thai-roomy');
  });

  it('never reports scripts with no stacked marks, clipped just as hard', async () => {
    const { violations } = await scan('clipped-marks.html');
    const flagged = flaggedBy(violations, 'clipped-stacked-marks');

    expect(flagged).not.toContain('#latin-clipped');
    expect(flagged).not.toContain('#han-clipped');
  });
});

describe('the snapshot the rules were given', () => {
  it('is at the version the rules were written against', async () => {
    const { snapshot } = await scan('cursive-letter-spacing.html');

    expect(snapshot.snapshotVersion).toBe(3);
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
