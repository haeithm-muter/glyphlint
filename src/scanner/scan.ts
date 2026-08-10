/**
 * Scan orchestration.
 *
 * Opens a real browser, lets axe-core do the standard audit, captures our snapshot, and returns
 * both side by side. The one rule that governs this file: **axe's results are never touched.**
 * They are not filtered, re-scored, re-worded or merged into ours. The separation between
 * `standard` and `scriptAware` in the result is the claim this project makes, and it has to be
 * visible in the code, not just in the README.
 */

import { AxeBuilder } from '@axe-core/playwright';
import { chromium, type Browser } from 'playwright';

import type {
  DomSnapshot,
  ScanResult,
  ScanOptions,
  ScriptId,
  UnsupportedScriptReport,
} from '../types.js';
import { captureSnapshot } from './capture.js';
import { classifyScanError, scanError } from './errors.js';

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_VIEWPORT = { width: 1280, height: 800 };
const DEFAULT_MAX_NODES = 3000;
const DEFAULT_MAX_TEXT_LENGTH = 500;

/** Enough excerpts to identify the writing system, not so many that they become the output. */
const MAX_UNSUPPORTED_SAMPLES = 5;
const UNSUPPORTED_SAMPLE_LENGTH = 40;

/** Count how many text nodes came out in each writing system. */
function tallyScripts(snapshot: DomSnapshot): Partial<Record<ScriptId, number>> {
  const tally: Partial<Record<ScriptId, number>> = {};
  for (const node of snapshot.nodes) {
    tally[node.dominantScript] = (tally[node.dominantScript] ?? 0) + 1;
  }
  return tally;
}

/**
 * Find the text we could not attribute to any writing system we model.
 *
 * Scanning the *runs* rather than each node's dominant script is deliberate. An English page
 * carrying one Bengali paragraph has `dominantScript: 'latin'` on almost every node, and
 * checking only the dominant script would let exactly the case this report exists for slip
 * through unnoticed.
 */
function findUnsupportedScript(snapshot: DomSnapshot): UnsupportedScriptReport | undefined {
  let nodeCount = 0;
  const samples: string[] = [];

  for (const node of snapshot.nodes) {
    const unknownRuns = node.scriptRuns.filter((run) => run.script === 'unknown');
    if (unknownRuns.length === 0) continue;

    nodeCount += 1;

    for (const run of unknownRuns) {
      if (samples.length >= MAX_UNSUPPORTED_SAMPLES) break;
      const sample = run.text.trim().slice(0, UNSUPPORTED_SAMPLE_LENGTH);
      if (sample !== '' && !samples.includes(sample)) samples.push(sample);
    }
  }

  return nodeCount === 0 ? undefined : { nodeCount, samples };
}

/**
 * Scan one URL.
 *
 * Never throws for a page-level problem: an unreachable host, a timeout or a PDF all come back
 * as a `ScanResult` carrying an `error`, so a campaign run over many sites is not derailed by
 * one bad entry.
 */
export async function scanUrl(url: string, options: ScanOptions = {}): Promise<ScanResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const viewport = options.viewport ?? DEFAULT_VIEWPORT;
  const limits = {
    maxNodes: options.maxNodes ?? DEFAULT_MAX_NODES,
    maxTextLength: options.maxTextLength ?? DEFAULT_MAX_TEXT_LENGTH,
  };

  const startedAt = Date.now();
  const scannedAt = new Date().toISOString();

  const failure = (error: ReturnType<typeof scanError>, finalUrl: string): ScanResult => ({
    url,
    finalUrl,
    scannedAt,
    durationMs: Date.now() - startedAt,
    standard: { violations: [], passes: 0 },
    scriptAware: { violations: [] },
    scriptsDetected: {},
    error,
  });

  let browser: Browser | undefined;

  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    const response = await page.goto(url, { waitUntil: 'networkidle', timeout: timeoutMs });
    const finalUrl = page.url();

    if (response === null) {
      return failure(scanError('unknown', { url, timeoutMs }, 'Navigation returned no response.'), finalUrl);
    }

    // A URL that answers with a PDF or an image is not a page we can audit, and saying so is
    // more useful than reporting zero violations against something we never read.
    const contentType = response.headers()['content-type'] ?? '';
    if (contentType !== '' && !contentType.includes('html')) {
      return failure(scanError('non-html-content', { url, timeoutMs }, `Content-Type: ${contentType}`), finalUrl);
    }

    const bodyLength = await page.evaluate(() => document.body?.innerHTML.trim().length ?? 0);
    if (bodyLength === 0) {
      return failure(scanError('empty-body', { url, timeoutMs }), finalUrl);
    }

    // axe-core runs first and its output is copied across verbatim.
    const axeResults = await new AxeBuilder({ page }).analyze();

    const snapshot = await captureSnapshot(page, url, limits);

    let screenshotPath: string | undefined;
    if (options.screenshotPath !== undefined) {
      await page.screenshot({ path: options.screenshotPath, fullPage: true });
      screenshotPath = options.screenshotPath;
    }

    const result: ScanResult = {
      url,
      finalUrl,
      scannedAt,
      durationMs: Date.now() - startedAt,
      standard: { violations: axeResults.violations, passes: axeResults.passes.length },
      scriptAware: { violations: [] },
      scriptsDetected: tallyScripts(snapshot),
      snapshot,
    };

    const unsupportedScript = findUnsupportedScript(snapshot);
    if (unsupportedScript !== undefined) result.unsupportedScript = unsupportedScript;
    if (screenshotPath !== undefined) result.screenshotPath = screenshotPath;

    return result;
  } catch (error) {
    return failure(classifyScanError(error, { url, timeoutMs }), url);
  } finally {
    await browser?.close();
  }
}
