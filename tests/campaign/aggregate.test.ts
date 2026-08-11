/**
 * The campaign aggregate.
 *
 * These are the numbers that will eventually appear in a README, so the tests are less about
 * arithmetic than about honesty: the denominator is the sites actually scanned, the two layers are
 * never added together, and the writing-system breakdown comes from what was measured rather than
 * from what the target list claimed.
 */

import { describe, expect, it } from 'vitest';

import { aggregateCampaign, percentOf } from '../../src/campaign/aggregate.js';
import type { CampaignRun, SiteRecord } from '../../src/campaign/runner.js';
import { makeAxeViolation, makeClippedViolation, makeCursiveViolation } from '../report/make-result.js';

function site(overrides: Partial<SiteRecord> & { url: string }): SiteRecord {
  return {
    script: 'arabic',
    status: 'scanned',
    startedAt: '2026-08-11T10:00:00.000Z',
    durationMs: 1000,
    scriptsDetected: { arabic: 5 },
    standard: { violations: [], passes: 10 },
    scriptAware: { violations: [] },
    ...overrides,
  };
}

function run(sites: SiteRecord[]): CampaignRun {
  return {
    campaignVersion: 1,
    startedAt: '2026-08-11T10:00:00.000Z',
    finishedAt: '2026-08-11T10:05:00.000Z',
    userAgent: 'GlyphLint/0.1 test',
    delayMs: 2000,
    siteTimeoutMs: 60_000,
    abandonedScans: 0,
    sites,
  };
}

describe('percentages', () => {
  it('are computed to one decimal place', () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 4)).toBe(50);
  });

  it('are zero when there is nothing to divide by, rather than not a number', () => {
    expect(percentOf(0, 0)).toBe(0);
  });
});

describe('the denominator', () => {
  const campaign = run([
    site({ url: 'https://a.example', scriptAware: { violations: [makeCursiveViolation()] } }),
    site({ url: 'https://b.example' }),
    site({ url: 'https://c.example', status: 'disallowed', reason: 'robots.txt asks us not to.' }),
    site({ url: 'https://d.example', status: 'skipped', reason: 'robots.txt could not be read.' }),
    site({ url: 'https://e.example', status: 'failed', reason: 'The page timed out.' }),
  ]);

  it('is the number of sites scanned, not the number listed', () => {
    const aggregate = aggregateCampaign(campaign);

    expect(aggregate.targets).toBe(5);
    expect(aggregate.percentagesAreOutOf).toBe(2);
  });

  it('counts every outcome explicitly, so nothing disappears', () => {
    expect(aggregateCampaign(campaign).outcomes).toEqual({
      scanned: 2,
      disallowed: 1,
      skipped: 1,
      failed: 1,
    });
  });

  it('reports a rule found on one of two scanned sites as 50%, not 20%', () => {
    // The whole reason `percentagesAreOutOf` exists: three of these five sites were never looked
    // at, and counting them as evidence in either direction would be inventing data.
    const aggregate = aggregateCampaign(campaign);

    expect(aggregate.issues.scriptAware[0]?.sites).toBe(1);
    expect(aggregate.issues.scriptAware[0]?.sitesPercent).toBe(50);
  });
});

describe('the two layers', () => {
  const campaign = run([
    site({
      url: 'https://a.example',
      standard: { violations: [makeAxeViolation()], passes: 10 },
      scriptAware: { violations: [makeCursiveViolation(), makeClippedViolation()] },
    }),
    site({
      url: 'https://b.example',
      standard: { violations: [makeAxeViolation({ id: 'label' })], passes: 12 },
      scriptAware: { violations: [] },
    }),
  ]);

  it('are counted side by side and never summed', () => {
    const { layers } = aggregateCampaign(campaign);

    expect(layers.standard.elements).toBe(2);
    expect(layers.scriptAware.elements).toBe(2);
    expect(layers.standard.passes).toBe(22);
    // There is no field anywhere in the aggregate holding the two added together.
    expect(Object.keys(layers)).toEqual(['standard', 'scriptAware']);
  });

  it('counts the sites each layer had something to say about', () => {
    const { layers } = aggregateCampaign(campaign);

    expect(layers.standard.sitesWithFindings).toBe(2);
    expect(layers.scriptAware.sitesWithFindings).toBe(1);
  });

  it('ranks issues within a layer, never across the two', () => {
    const { issues } = aggregateCampaign(campaign);

    expect(issues.standard.every((row) => row.source === 'axe-core')).toBe(true);
    expect(issues.scriptAware.every((row) => row.source === 'glyphlint')).toBe(true);
  });

  it('reproduces axe help text as the issue title rather than writing its own', () => {
    const row = aggregateCampaign(campaign).issues.standard[0];

    expect(row?.title).toBe('Images must have alternative text');
  });

  it('carries confidence for our rules and leaves it absent for axe', () => {
    const aggregate = aggregateCampaign(campaign);

    expect(aggregate.issues.standard[0]?.confidence).toBeUndefined();
    expect(aggregate.issues.scriptAware[0]?.confidence).toBeDefined();
  });
});

describe('ranking', () => {
  it('puts the most widespread issue first, then the one touching more elements', () => {
    const campaign = run([
      site({
        url: 'https://a.example',
        scriptAware: { violations: [makeCursiveViolation('#one'), makeClippedViolation()] },
      }),
      site({
        url: 'https://b.example',
        script: 'thai',
        scriptsDetected: { thai: 4 },
        scriptAware: { violations: [makeClippedViolation('#two')] },
      }),
    ]);

    const rows = aggregateCampaign(campaign).issues.scriptAware;
    expect(rows[0]?.ruleId).toBe('clipped-stacked-marks');
    expect(rows[0]?.sites).toBe(2);
    expect(rows[0]?.sitesPercent).toBe(100);
    expect(rows[1]?.ruleId).toBe('cursive-script-letter-spacing');
  });
});

describe('writing systems, claimed and measured', () => {
  it('breaks findings down by the script the rule actually reported', () => {
    const campaign = run([
      site({
        url: 'https://a.example',
        scriptAware: { violations: [makeCursiveViolation(), makeClippedViolation()] },
      }),
    ]);

    expect(aggregateCampaign(campaign).byDetectedScript).toEqual([
      { script: 'arabic', label: 'Arabic', sites: 1, findings: 1 },
      { script: 'thai', label: 'Thai', sites: 1, findings: 1 },
    ]);
  });

  it('groups by the label the list gave, separately from what was measured', () => {
    const campaign = run([
      site({ url: 'https://a.example', script: 'arabic' }),
      site({
        url: 'https://b.example',
        script: 'cjk',
        scriptsDetected: { han: 20 },
        scriptAware: { violations: [makeCursiveViolation()] },
      }),
    ]);

    const byGroup = aggregateCampaign(campaign).byGroup;
    expect(byGroup.find((row) => row.group === 'arabic')?.scanned).toBe(1);
    expect(byGroup.find((row) => row.group === 'cjk')?.sitesWithScriptAwareFindings).toBe(1);
    // Groups nobody listed are left out rather than printed as rows of zeros.
    expect(byGroup.some((row) => row.group === 'hebrew')).toBe(false);
  });

  it('names a site whose page contains none of the writing systems its group implies', () => {
    const campaign = run([
      site({ url: 'https://mislabelled.example', script: 'thai', scriptsDetected: { latin: 30 } }),
      site({ url: 'https://fine.example', script: 'arabic', scriptsDetected: { arabic: 12 } }),
    ]);

    const mismatches = aggregateCampaign(campaign).labelMismatches;
    expect(mismatches).toHaveLength(1);
    expect(mismatches[0]?.url).toBe('https://mislabelled.example');
    expect(mismatches[0]?.listedAs).toBe('thai');
    expect(mismatches[0]?.detected).toEqual(['latin']);
  });

  it('accepts a CJK page that carries any one of the three writing systems', () => {
    const campaign = run([
      site({ url: 'https://kr.example', script: 'cjk', scriptsDetected: { hangul: 40 } }),
    ]);

    expect(aggregateCampaign(campaign).labelMismatches).toEqual([]);
  });

  it('judges a mismatch only on sites it actually scanned', () => {
    const campaign = run([
      site({ url: 'https://blocked.example', script: 'thai', status: 'disallowed', scriptsDetected: undefined }),
    ]);

    expect(aggregateCampaign(campaign).labelMismatches).toEqual([]);
  });
});

describe('an empty campaign', () => {
  it('produces zeros rather than failing', () => {
    const aggregate = aggregateCampaign(run([]));

    expect(aggregate.targets).toBe(0);
    expect(aggregate.percentagesAreOutOf).toBe(0);
    expect(aggregate.issues.standard).toEqual([]);
    expect(aggregate.byGroup).toEqual([]);
  });

  it('produces the same numbers twice for the same run', () => {
    const campaign = run([site({ url: 'https://a.example' })]);

    expect(aggregateCampaign(campaign)).toEqual(aggregateCampaign(campaign));
  });
});
