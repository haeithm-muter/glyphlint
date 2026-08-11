/**
 * The campaign runner.
 *
 * Impure, sequential, and slow on purpose. Thirty homepages belonging to thirty organisations who
 * did not ask to be scanned, so every decision here is made in their favour rather than ours:
 *
 * - **One site at a time.** No concurrency. A parallel runner would be four times faster and would
 *   also mean four strangers' servers answering us at once.
 * - **At least two seconds between sites,** raised by `--delay` or by a site's own `Crawl-delay`,
 *   never lowered. The only exemption is a loopback host, which is our own machine and is how the
 *   tests run in seconds rather than minutes.
 * - **Permission first.** `robots.txt` is fetched before the page, and a host that cannot answer is
 *   not scanned.
 * - **The homepage and nothing else.** No crawling, no link following, no asset collection beyond
 *   what rendering the page itself requires.
 * - **One failure never ends the run.** Every outcome — scanned, disallowed, skipped, failed — is a
 *   record in the results, and a site that times out costs that site and nothing more.
 */

import path from 'node:path';

import { scanUrl } from '../scanner/scan.js';
import type {
  AxeViolation,
  ScanError,
  ScriptId,
  UnsupportedScriptReport,
  Violation,
} from '../types.js';
import { USER_AGENT, checkPermission, type PermissionDecision } from './permission.js';
import type { CampaignTarget, TargetGroup } from './targets.js';

/** The floor the specification calls non-negotiable. Raised by options, never lowered. */
export const MINIMUM_DELAY_MS = 2000;

/** How long one site may take in total, including axe and the snapshot, not just the page load. */
export const DEFAULT_SITE_TIMEOUT_MS = 60_000;

/** What happened to one target. */
export type SiteStatus =
  /** Scanned, and the findings are here. */
  | 'scanned'
  /** robots.txt exists and refuses us. The site answered; the answer is recorded. */
  | 'disallowed'
  /** Permission could not be established — no answer is not the same as a yes. */
  | 'skipped'
  /** We tried to scan it and could not. */
  | 'failed';

export interface SiteRecord {
  url: string;
  finalUrl?: string;
  /** The group this target was listed under. A claim about the site, not a measurement of it. */
  script: TargetGroup;
  note?: string;
  status: SiteStatus;
  startedAt: string;
  durationMs: number;
  /** Why, for anything other than `scanned`. Constructive and factual: nobody is being accused. */
  reason?: string;
  detail?: string;
  standard?: { violations: AxeViolation[]; passes: number };
  scriptAware?: { violations: Violation[] };
  /** What the page turned out to be written in, whatever the list claimed. */
  scriptsDetected?: Partial<Record<ScriptId, number>>;
  unsupportedScript?: UnsupportedScriptReport;
  screenshotPath?: string;
}

export interface CampaignRun {
  campaignVersion: 1;
  startedAt: string;
  finishedAt: string;
  /** Recorded in the results so that anyone auditing the run can see what visited their server. */
  userAgent: string;
  delayMs: number;
  siteTimeoutMs: number;
  /**
   * Scans that ran past the site timeout and were left running.
   *
   * Recorded rather than inferred from the site rows, because the caller needs it: an abandoned
   * scan still holds a browser, and Node will not exit while one is open. The CLI reads this to
   * decide whether to end the process itself once the results are safely written.
   */
  abandonedScans: number;
  sites: SiteRecord[];
}

export type CampaignProgress =
  | { kind: 'site-start'; index: number; total: number; url: string }
  | { kind: 'site-done'; index: number; total: number; record: SiteRecord }
  | { kind: 'waiting'; ms: number };

export interface CampaignOptions {
  /** Milliseconds between sites. Clamped up to `MINIMUM_DELAY_MS` for any host but loopback. */
  delayMs?: number;
  siteTimeoutMs?: number;
  /** Off by default: thirty full-page images of other people's sites is closer to collecting. */
  screenshots?: boolean;
  screenshotDirectory?: string;
  userAgent?: string;
  onProgress?: (event: CampaignProgress) => void;
}

/** Our own machine, where the rate limit is protecting nobody. */
export function isLoopback(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

/**
 * How long to wait after finishing with a host.
 *
 * The floor applies to the site just scanned, because that is the server the pause protects.
 */
export function delayAfter(url: string, configuredMs: number, crawlDelaySeconds?: number): number {
  const crawlMs = crawlDelaySeconds === undefined ? 0 : Math.round(crawlDelaySeconds * 1000);
  const floor = isLoopback(url) ? 0 : MINIMUM_DELAY_MS;
  return Math.max(floor, configuredMs, crawlMs);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** A sentinel that cannot be confused with a result. */
const TIMED_OUT = Symbol('timed-out');

/**
 * Race a scan against the clock.
 *
 * A scan that loses the race is abandoned rather than cancelled: `scanUrl` owns its browser and
 * closes it in its own `finally`, and there is no handle here to interrupt it with. That is why
 * the CLI exits explicitly when a campaign finishes — an abandoned scan can keep Node's event loop
 * alive after the results have been written, and a campaign that has already saved its results
 * should not appear to hang.
 */
async function withTimeout<T>(work: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  let timer: NodeJS.Timeout | undefined;
  const clock = new Promise<typeof TIMED_OUT>((resolve) => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });

  try {
    return await Promise.race([work, clock]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** A sentence a site owner could read without being insulted by it. */
const REFUSAL_REASONS: Readonly<Record<PermissionDecision['reason'], string>> = {
  'robots-allows': 'robots.txt permits this path.',
  'no-robots-file': 'The site publishes no robots.txt, so no rule applies.',
  'robots-disallows': 'The site’s robots.txt asks scanners not to fetch this path, so it was not fetched.',
  'robots-unreachable':
    'robots.txt could not be read, and permission that cannot be established is not assumed. The site was left alone.',
};

function screenshotPathFor(
  target: CampaignTarget,
  index: number,
  directory: string,
): string | undefined {
  try {
    const { hostname } = new URL(target.url);
    const safe = hostname.replace(/[^a-zA-Z0-9.-]/gu, '-');
    return path.join(directory, `${String(index + 1).padStart(2, '0')}-${safe}.png`);
  } catch {
    return undefined;
  }
}

/** Turn a finished scan into the record that goes into the results file. */
function recordFor(
  target: CampaignTarget,
  base: { startedAt: string; durationMs: number },
  scan: Awaited<ReturnType<typeof scanUrl>>,
): SiteRecord {
  const record: SiteRecord = {
    url: target.url,
    finalUrl: scan.finalUrl,
    script: target.script,
    status: scan.error === undefined ? 'scanned' : 'failed',
    startedAt: base.startedAt,
    durationMs: base.durationMs,
  };
  if (target.note !== undefined) record.note = target.note;

  if (scan.error !== undefined) {
    const error: ScanError = scan.error;
    record.reason = error.message;
    if (error.detail !== undefined) record.detail = error.detail;
    return record;
  }

  // The snapshot is deliberately dropped. It is the largest thing a scan produces — three thousand
  // nodes of computed CSS per page — and a results file of thirty of them is one nobody opens and
  // git struggles to store. The findings are what the campaign is about, and they are all here.
  record.standard = { violations: scan.standard.violations, passes: scan.standard.passes };
  record.scriptAware = { violations: scan.scriptAware.violations };
  record.scriptsDetected = scan.scriptsDetected;
  if (scan.unsupportedScript !== undefined) record.unsupportedScript = scan.unsupportedScript;
  if (scan.screenshotPath !== undefined) record.screenshotPath = scan.screenshotPath;

  return record;
}

/**
 * Run one campaign.
 *
 * Never throws. Every site produces exactly one record, in the order the targets were listed, and
 * the run reaches the end of the list whatever happens on the way.
 */
export async function runCampaign(
  targets: readonly CampaignTarget[],
  options: CampaignOptions = {},
): Promise<CampaignRun> {
  const userAgent = options.userAgent ?? USER_AGENT;
  const siteTimeoutMs = options.siteTimeoutMs ?? DEFAULT_SITE_TIMEOUT_MS;
  const configuredDelayMs = options.delayMs ?? MINIMUM_DELAY_MS;
  const report = options.onProgress ?? ((): void => {});

  const startedAt = new Date().toISOString();
  const sites: SiteRecord[] = [];
  let abandonedScans = 0;

  for (const [index, target] of targets.entries()) {
    report({ kind: 'site-start', index, total: targets.length, url: target.url });

    const siteStartedAt = new Date().toISOString();
    const startedMs = Date.now();
    const finish = (record: SiteRecord): SiteRecord => {
      record.durationMs = Date.now() - startedMs;
      sites.push(record);
      report({ kind: 'site-done', index, total: targets.length, record });
      return record;
    };

    const permission = await checkPermission(target.url, { userAgent });

    if (!permission.allowed) {
      const record: SiteRecord = {
        url: target.url,
        script: target.script,
        status: permission.reason === 'robots-disallows' ? 'disallowed' : 'skipped',
        startedAt: siteStartedAt,
        durationMs: 0,
        reason: REFUSAL_REASONS[permission.reason],
      };
      if (target.note !== undefined) record.note = target.note;
      if (permission.reason === 'robots-unreachable') record.detail = permission.detail;
      finish(record);
    } else {
      const scanOptions: Parameters<typeof scanUrl>[1] = { userAgent, timeoutMs: siteTimeoutMs };
      if (options.screenshots === true) {
        const shot = screenshotPathFor(target, index, options.screenshotDirectory ?? '.');
        if (shot !== undefined) scanOptions.screenshotPath = shot;
      }

      const scan = await withTimeout(scanUrl(target.url, scanOptions), siteTimeoutMs);

      if (scan === TIMED_OUT) {
        abandonedScans += 1;
        const record: SiteRecord = {
          url: target.url,
          script: target.script,
          status: 'failed',
          startedAt: siteStartedAt,
          durationMs: 0,
          reason: `The scan did not finish within ${siteTimeoutMs} ms and was given up on.`,
        };
        if (target.note !== undefined) record.note = target.note;
        finish(record);
      } else {
        finish(recordFor(target, { startedAt: siteStartedAt, durationMs: 0 }, scan));
      }
    }

    // No pause after the last site: the delay protects the next server, and there is not one.
    const isLast = index === targets.length - 1;
    if (!isLast) {
      const wait = delayAfter(target.url, configuredDelayMs, permission.allowed ? permission.crawlDelaySeconds : undefined);
      if (wait > 0) {
        report({ kind: 'waiting', ms: wait });
        await sleep(wait);
      }
    }
  }

  return {
    campaignVersion: 1,
    startedAt,
    finishedAt: new Date().toISOString(),
    userAgent,
    delayMs: configuredDelayMs,
    siteTimeoutMs,
    abandonedScans,
    sites,
  };
}
