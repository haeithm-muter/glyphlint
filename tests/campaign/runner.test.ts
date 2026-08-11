/**
 * The campaign runner, against real origins.
 *
 * This file needs Chromium: it runs the real scanner over local servers. What it exists to prove
 * is the set of promises the campaign specification calls non-negotiable — permission is asked
 * before a page is fetched, a refusal is obeyed and recorded, a host that cannot answer is left
 * alone, one broken site does not end the run, and the User-Agent we send is the honest one.
 *
 * The pure half of the file — the rate limit arithmetic — is tested without any of that, because
 * a floor that only holds when a browser is running is not a floor.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { aggregateCampaign } from '../../src/campaign/aggregate.js';
import { USER_AGENT } from '../../src/campaign/permission.js';
import {
  MINIMUM_DELAY_MS,
  delayAfter,
  isLoopback,
  runCampaign,
  type CampaignRun,
} from '../../src/campaign/runner.js';
import type { CampaignTarget } from '../../src/campaign/targets.js';
import { startCampaignServers, type CampaignServer } from './campaign-server.js';

describe('the rate limit', () => {
  it('never goes below two seconds for a host on the internet', () => {
    expect(delayAfter('https://example.com', 0)).toBe(MINIMUM_DELAY_MS);
    expect(delayAfter('https://example.com', 500)).toBe(MINIMUM_DELAY_MS);
    // A floor, not a setting: asking for less does not get you less.
    expect(delayAfter('https://example.com', 5000)).toBe(5000);
  });

  it('takes the site Crawl-delay when that is longer than ours', () => {
    expect(delayAfter('https://example.com', 2000, 10)).toBe(10_000);
    // And never shortens our pause because a site said a smaller number.
    expect(delayAfter('https://example.com', 5000, 1)).toBe(5000);
  });

  it('is waived only for our own machine', () => {
    expect(isLoopback('http://127.0.0.1:8080/page')).toBe(true);
    expect(isLoopback('http://localhost:3000/')).toBe(true);
    expect(isLoopback('https://example.com')).toBe(false);
    expect(isLoopback('not a url')).toBe(false);

    expect(delayAfter('http://127.0.0.1:8080/', 0)).toBe(0);
    // Even on loopback, a Crawl-delay is still honoured: it was asked for explicitly.
    expect(delayAfter('http://127.0.0.1:8080/', 0, 2)).toBe(2000);
  });
});

describe('a campaign across several sites', () => {
  let server: CampaignServer;
  let run: CampaignRun;

  beforeAll(async () => {
    server = await startCampaignServers([
      // Permits us, and has something for both layers to report.
      { robots: { kind: 'allow-all' }, page: 'report-source.html' },
      // Refuses us.
      { robots: { kind: 'disallow-all' }, page: 'report-source.html' },
      // Cannot tell us either way.
      { robots: { kind: 'error' }, page: 'report-source.html' },
      // Permits us, and then fails to serve a page.
      { robots: { kind: 'allow-all' }, page: 'not-html' },
      // Publishes no robots.txt at all, which is permission.
      { robots: { kind: 'missing' }, page: 'clean.html' },
    ]);

    const targets: CampaignTarget[] = [
      { url: `${server.origins[0] ?? ''}/report-source.html`, script: 'arabic', note: 'both layers' },
      { url: `${server.origins[1] ?? ''}/report-source.html`, script: 'hebrew' },
      { url: `${server.origins[2] ?? ''}/report-source.html`, script: 'thai' },
      { url: `${server.origins[3] ?? ''}/page`, script: 'cjk' },
      { url: `${server.origins[4] ?? ''}/clean.html`, script: 'vietnamese' },
    ];

    // Loopback, so the two-second floor does not apply and the suite finishes in seconds.
    run = await runCampaign(targets, { delayMs: 0 });
  }, 180_000);

  afterAll(async () => {
    await server.close();
  });

  it('produces one record per target, in the order they were listed', () => {
    expect(run.sites).toHaveLength(5);
    expect(run.sites.map((site) => site.script)).toEqual([
      'arabic',
      'hebrew',
      'thai',
      'cjk',
      'vietnamese',
    ]);
  });

  it('scans the site that permits it, and reports both layers', () => {
    const site = run.sites[0];

    expect(site?.status).toBe('scanned');
    expect(site?.standard?.violations.length).toBeGreaterThan(0);
    expect(site?.scriptAware?.violations.length).toBeGreaterThan(0);
    expect(site?.scriptsDetected?.arabic).toBeGreaterThan(0);
  });

  it('obeys a refusal, records it, and never requests the page', () => {
    const site = run.sites[1];

    expect(site?.status).toBe('disallowed');
    expect(site?.reason).toContain('robots.txt');
    // The assertion that matters: the only thing we asked that server for was permission.
    expect(server.requests(1).map((request) => request.path)).toEqual(['/robots.txt']);
  });

  it('leaves a host that cannot answer alone, and calls that skipped rather than disallowed', () => {
    const site = run.sites[2];

    // A server that failed to answer did not refuse us — and it did not agree either. The two
    // outcomes are recorded separately because they mean different things about the site.
    expect(site?.status).toBe('skipped');
    expect(site?.reason).toContain('permission that cannot be established is not assumed');
    expect(server.requests(2).map((request) => request.path)).toEqual(['/robots.txt']);
  });

  it('records a site that could not be scanned without ending the run', () => {
    const site = run.sites[3];

    expect(site?.status).toBe('failed');
    expect(site?.reason).not.toBe('');
    // The site after the failure was still scanned, which is the whole point.
    expect(run.sites[4]?.status).toBe('scanned');
  });

  it('treats an absent robots.txt as permission', () => {
    expect(run.sites[4]?.status).toBe('scanned');
    expect(server.requests(4).map((request) => request.path)).toContain('/robots.txt');
  });

  it('identifies itself honestly to every server, for robots.txt and for the page', () => {
    const seen = new Set(
      [0, 1, 2, 3, 4].flatMap((index) =>
        server.requests(index).map((request) => request.userAgent ?? ''),
      ),
    );

    expect([...seen]).toEqual([USER_AGENT]);
    // Not a browser string. Pretending to be Chrome would get past more bot detection and would
    // be a scanner disguising itself, which this project does not get to do.
    expect(USER_AGENT).not.toContain('Mozilla');
    expect(USER_AGENT).toContain('https://github.com/haeithm-muter/glyphlint');
  });

  it('records what it was and how it was configured, for anyone auditing the run', () => {
    expect(run.userAgent).toBe(USER_AGENT);
    expect(run.campaignVersion).toBe(1);
    expect(run.abandonedScans).toBe(0);
    expect(Date.parse(run.finishedAt)).toBeGreaterThanOrEqual(Date.parse(run.startedAt));
  });

  it('aggregates over the sites it actually scanned', () => {
    const aggregate = aggregateCampaign(run);

    expect(aggregate.targets).toBe(5);
    expect(aggregate.outcomes).toEqual({ scanned: 2, disallowed: 1, skipped: 1, failed: 1 });
    expect(aggregate.percentagesAreOutOf).toBe(2);
    expect(aggregate.issues.scriptAware.length).toBeGreaterThan(0);
    // One of the two scanned pages is the clean fixture, so a rule found on the other is 50%.
    expect(aggregate.issues.scriptAware[0]?.sitesPercent).toBe(50);
  });
});

describe('a target that cannot be reached at all', () => {
  it('is skipped rather than crashing the run', async () => {
    // Nothing is listening on this port, so even robots.txt fails. Permission was never
    // established, so the page is never requested.
    const run = await runCampaign(
      [{ url: 'http://127.0.0.1:1/', script: 'arabic' }],
      { delayMs: 0 },
    );

    expect(run.sites[0]?.status).toBe('skipped');
    expect(run.sites[0]?.detail).not.toBe('');
  }, 60_000);
});
