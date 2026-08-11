/**
 * The README numbers.
 *
 * These tests exist to protect one promise: every figure in the README came out of a results file,
 * and running `npm run metrics` twice cannot change it. The block is also where a campaign is most
 * tempted to flatter itself, so the denominators and the refusal to compare the two layers are
 * asserted rather than trusted to survive an edit.
 */

import { describe, expect, it } from 'vitest';

import {
  METRICS_END,
  METRICS_START,
  MetricsError,
  renderMetricsBlock,
  spliceMetricsBlock,
  type CampaignDocument,
} from '../../src/report/metrics.js';

/** A campaign document shaped like the one the CLI writes, with numbers chosen to be recognisable. */
function makeDocument(overrides: Partial<CampaignDocument> = {}): CampaignDocument {
  return {
    campaignVersion: 1,
    startedAt: '2026-08-11T09:00:00.000Z',
    finishedAt: '2026-08-11T09:12:00.000Z',
    userAgent: 'GlyphLint/0.1 (+https://example.invalid/glyphlint) accessibility research scanner',
    delayMs: 2000,
    siteTimeoutMs: 60_000,
    abandonedScans: 2,
    sites: [],
    targetList: { path: 'sites/targets.json', available: 30, attempted: 10 },
    aggregate: {
      targets: 10,
      outcomes: { scanned: 7, disallowed: 0, skipped: 1, failed: 2 },
      percentagesAreOutOf: 7,
      layers: {
        standard: { sitesWithFindings: 7, rules: 17, elements: 588, passes: 230 },
        scriptAware: { sitesWithFindings: 5, rules: 11, elements: 1635 },
      },
      issues: {
        standard: [],
        scriptAware: [
          {
            source: 'glyphlint',
            ruleId: 'physical-css-in-bidi-context',
            title: 'Physical CSS in a right-to-left context',
            severity: 'moderate',
            confidence: 'medium',
            sites: 5,
            sitesPercent: 71.4,
            elements: 647,
          },
          {
            source: 'glyphlint',
            ruleId: 'cursive-script-letter-spacing',
            title: 'Letter spacing applied to a cursive script',
            severity: 'critical',
            confidence: 'high',
            sites: 1,
            sitesPercent: 14.3,
            elements: 1,
          },
        ],
      },
      byGroup: [],
      byDetectedScript: [],
      labelMismatches: [
        { url: 'https://www.isna.ir', listedAs: 'persian/urdu', detected: ['latin'] },
        { url: 'https://www.irna.ir', listedAs: 'persian/urdu', detected: ['latin'] },
      ],
    },
    ...overrides,
  };
}

describe('the generated block', () => {
  it('separates targets attempted, sites that answered, and sites actually measured', () => {
    const block = renderMetricsBlock(makeDocument());

    expect(block).toContain('**10 targets attempted** out of 30 on the list');
    expect(block).toContain('**7 answered**');
    expect(block).toContain('**5 served a page in the writing system they were listed for**');
  });

  it('names the sites that answered with something other than their homepage', () => {
    // The finding that must not become a rounding difference: two sites served an error page, and
    // the README says which ones rather than quietly shrinking a total.
    const block = renderMetricsBlock(makeDocument());

    expect(block).toContain('https://www.isna.ir');
    expect(block).toContain('https://www.irna.ir');
    expect(block).toContain('did not serve their homepage');
  });

  it('states the denominator beside the percentages', () => {
    const block = renderMetricsBlock(makeDocument());

    expect(block).toContain('out of the 7 sites that were scanned');
    expect(block).toContain('not out of the 10 attempted, and not out of the web');
  });

  it('prints the two layers side by side and refuses to compare them', () => {
    const block = renderMetricsBlock(makeDocument());

    expect(block).toContain('| Standard rules (axe-core) | 17 | 588 | 7 |');
    expect(block).toContain('| Script-aware rules (GlyphLint) | 11 | 1635 | 5 |');
    expect(block).toContain('not comparable and are not compared here');
    // The number a careless reader would want, and the one that must never be generated: 1635/588.
    expect(block).not.toMatch(/2\.8|three times|3x/u);
  });

  it('credits axe with its own findings', () => {
    expect(renderMetricsBlock(makeDocument())).toContain("axe's work, not ours");
  });

  it('ranks our rules with their severity and confidence', () => {
    const block = renderMetricsBlock(makeDocument());

    expect(block).toContain('| `physical-css-in-bidi-context` | 5 | 71.4% | 647 | moderate | medium |');
    expect(block).toContain('| `cursive-script-letter-spacing` | 1 | 14.3% | 1 | critical | high |');
  });

  it('produces the same text for the same document', () => {
    // Purity, and the reason `npm run metrics` can be run as a check rather than only as a write.
    expect(renderMetricsBlock(makeDocument())).toBe(renderMetricsBlock(makeDocument()));
  });

  it('says nothing about a mismatch when every site served what it was listed for', () => {
    const document = makeDocument();
    document.aggregate.labelMismatches = [];

    const block = renderMetricsBlock(document);
    expect(block).not.toContain('did not serve their homepage');
    expect(block).toContain('**7 served a page in the writing system they were listed for**');
  });
});

describe('splicing the block into the README', () => {
  const readme = `# glyphlint\n\n## Results\n\n${METRICS_START}\nold numbers\n${METRICS_END}\n\n## Next\n`;

  it('replaces only what is between the markers', () => {
    const updated = spliceMetricsBlock(readme, 'new numbers');

    expect(updated).toContain('# glyphlint');
    expect(updated).toContain('## Next');
    expect(updated).toContain('new numbers');
    expect(updated).not.toContain('old numbers');
  });

  it('is idempotent, so running metrics twice changes nothing the second time', () => {
    const once = spliceMetricsBlock(readme, 'new numbers');

    expect(spliceMetricsBlock(once, 'new numbers')).toBe(once);
  });

  it('refuses a README with no markers rather than guessing where numbers go', () => {
    expect(() => spliceMetricsBlock('# glyphlint\n', 'numbers')).toThrow(MetricsError);
    expect(() => spliceMetricsBlock(`# x\n${METRICS_START}\n`, 'numbers')).toThrow(MetricsError);
  });

  it('refuses markers that are the wrong way round', () => {
    const backwards = `# x\n${METRICS_END}\n${METRICS_START}\n`;

    expect(() => spliceMetricsBlock(backwards, 'numbers')).toThrow(/appears before/u);
  });
});
