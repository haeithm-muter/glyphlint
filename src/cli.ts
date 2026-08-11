#!/usr/bin/env node
/**
 * The command line: the impure shell around a pure core.
 *
 * Everything decided here is a fact about the environment rather than about the page — where a
 * file goes, whether a terminal wants colour, which exit code CI is about to read. The parsing
 * lives in `cli-args.ts` and the rendering in `report/`, both pure and both tested without any of
 * this running.
 *
 * The exit codes are a contract, not a convenience:
 *
 * | code | meaning |
 * |---|---|
 * | 0 | the scan ran and found nothing |
 * | 1 | the scan ran and found violations |
 * | 2 | the page could not be scanned at all |
 * | 3 | the command line was wrong |
 *
 * A CI job distinguishes "your page has problems" from "the scanner fell over", and a tool that
 * answers both with 1 makes a red build unreadable.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  aggregateCampaign,
  parseTargetsFile,
  runCampaign,
  TargetsError,
  USER_AGENT,
  type CampaignProgress,
} from './campaign/index.js';
import {
  UsageError,
  USAGE,
  parseArguments,
  type CampaignCommand,
  type ScanCommand,
} from './cli-args.js';
import {
  buildReportModel,
  renderHtmlReport,
  renderJsonReport,
  renderRulesTable,
  renderTerminalReport,
} from './report/index.js';
import { scanUrl } from './scanner/scan.js';
import type { ScanOptions, ScanResult } from './types.js';

/**
 * Where the screenshot goes when the caller did not name a path.
 *
 * A screenshot is taken by default because the evidence is worth having beside a report you are
 * going to send to somebody. Two rules keep that from being a nuisance: a report written to a file
 * gets its screenshot beside it under the same name, and a report written to stdout names the file
 * after the host, so scanning three sites in a row leaves three files rather than one overwritten
 * three times. Either way the path is printed on stderr, because a command that writes a file
 * nobody asked about should at least say so.
 */
function defaultScreenshotPath(command: ScanCommand): string {
  const outPath = command.outPath;
  if (outPath !== undefined) {
    const directory = path.dirname(outPath);
    const base = path.basename(outPath).replace(/\.[^.]+$/u, '');
    return path.join(directory, `${base === '' ? 'report' : base}.png`);
  }

  let host = '';
  try {
    host = new URL(command.url).hostname;
  } catch {
    // An unparseable URL is the scanner's problem to report, not ours to crash on.
    host = '';
  }

  // Anything that is not a plain host character becomes a dash: this string is about to be a
  // filename on Windows, where a colon is not negotiable.
  const safeHost = host.replace(/[^a-zA-Z0-9.-]/gu, '-');
  return `glyphlint-${safeHost === '' ? 'screenshot' : safeHost}.png`;
}

function screenshotPathFor(command: ScanCommand): string | undefined {
  const { screenshot } = command;
  if (screenshot.mode === 'off') return undefined;
  if (screenshot.mode === 'path') return screenshot.path;
  return defaultScreenshotPath(command);
}

/**
 * Whether to colour the output.
 *
 * Asked here and nowhere else. `report/` is pure and does not get to know what a terminal is, so
 * this answer is passed into the renderer as a value.
 */
function wantsColour(isFile: boolean): boolean {
  if (isFile) return false;
  if (process.env['NO_COLOR'] !== undefined) return false;
  return process.stdout.isTTY === true;
}

function renderReport(command: ScanCommand, result: ScanResult): string {
  const model = buildReportModel(result);

  if (command.format === 'json') return renderJsonReport(model);
  if (command.format === 'html') return renderHtmlReport(model);
  return renderTerminalReport(model, { colour: wantsColour(command.outPath !== undefined) });
}

/** Write the report where it was asked to go, creating the directory if it is missing. */
async function deliver(command: ScanCommand, body: string): Promise<void> {
  const outPath = command.outPath;
  if (outPath === undefined) {
    process.stdout.write(body);
    return;
  }

  const directory = path.dirname(outPath);
  if (directory !== '') await mkdir(directory, { recursive: true });
  await writeFile(outPath, body, 'utf8');
  process.stderr.write(`Report written to ${outPath}\n`);
}

/**
 * Everything GlyphLint wants to say that is not the report itself goes to stderr.
 *
 * Which means `glyphlint scan url --format json > report.json` still produces a valid JSON file,
 * and none of these notices can be lost by being written into the middle of it.
 */
function writeNotices(command: ScanCommand, result: ScanResult): void {
  if (command.unrecognisedRuleIds.length > 0) {
    process.stderr.write(
      `\nThese ids in --rules/--disable are not GlyphLint rules: ` +
        `${command.unrecognisedRuleIds.join(', ')}.\n` +
        'They were matched against axe-core\'s rule ids instead. If one of them is a typo, it ' +
        'silently narrowed nothing — run "glyphlint rules" for the list of ours.\n',
    );
  }

  if (result.unsupportedScript !== undefined) {
    const { nodeCount, samples } = result.unsupportedScript;
    const where = nodeCount === 1 ? '1 text node' : `${nodeCount} text nodes`;
    process.stderr.write(
      `\nGlyphLint found text in a writing system it does not support yet, in ${where}. ` +
        `That text was not checked by any script-aware rule.\n` +
        `Samples: ${samples.join('  |  ')}\n` +
        `Supported writing systems are listed in decision 007 of DECISIONS.md.\n`,
    );
  }

  if (result.filters !== undefined) {
    const { standard, scriptAware } = result.filters.withheld;
    if (standard + scriptAware > 0) {
      process.stderr.write(
        `\nFilters withheld ${standard} axe-core finding(s) and ${scriptAware} GlyphLint ` +
          'finding(s). They are counted in the report and shown nowhere in it.\n',
      );
    }
  }

  if (result.screenshotPath !== undefined) {
    process.stderr.write(`Screenshot written to ${result.screenshotPath}\n`);
  }
}

/** Run one scan and decide what the exit code should be. */
async function runScan(command: ScanCommand): Promise<number> {
  const options: ScanOptions = { filters: command.filters };
  if (command.timeoutMs !== undefined) options.timeoutMs = command.timeoutMs;

  const screenshotPath = screenshotPathFor(command);
  if (screenshotPath !== undefined) {
    const directory = path.dirname(screenshotPath);
    if (directory !== '') await mkdir(directory, { recursive: true });
    options.screenshotPath = screenshotPath;
  }

  const result = await scanUrl(command.url, options);

  await deliver(command, renderReport(command, result));
  writeNotices(command, result);

  // A page that could not be scanned is not a page with no problems, and the difference has to
  // survive into the exit code.
  if (result.error !== undefined) {
    process.stderr.write(`\n${result.error.message}\n`);
    return 2;
  }

  const found = result.standard.violations.length + result.scriptAware.violations.length;
  return found > 0 ? 1 : 0;
}

/** `2026-08-11`, for the results filename the metrics protocol reads. */
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** One line per site, written as something a site owner could read over your shoulder. */
function campaignProgress(event: CampaignProgress): void {
  if (event.kind === 'site-start') {
    process.stderr.write(`[${event.index + 1}/${event.total}] ${event.url}\n`);
    return;
  }

  if (event.kind === 'waiting') {
    process.stderr.write(`    waiting ${event.ms} ms before the next site\n`);
    return;
  }

  const { record } = event;
  if (record.status === 'scanned') {
    const standard = record.standard?.violations.length ?? 0;
    const scriptAware = record.scriptAware?.violations.length ?? 0;
    process.stderr.write(
      `    scanned in ${record.durationMs} ms — axe-core ${standard}, GlyphLint ${scriptAware}\n`,
    );
    return;
  }

  process.stderr.write(`    ${record.status}: ${record.reason ?? ''}\n`);
}

/**
 * Run a campaign.
 *
 * Exit codes follow the same contract as `scan`, read at the level of the whole run: 3 for a
 * target list we cannot use, 2 when not one site could be scanned, 1 when findings exist, 0 when
 * the campaign completed and found nothing. A single site failing is none of those — it is a row
 * in the results, which is the point of running a campaign rather than thirty scans.
 */
async function runCampaignCommand(command: CampaignCommand): Promise<number> {
  let targets: Awaited<ReturnType<typeof parseTargetsFile>>['targets'];
  try {
    targets = parseTargetsFile(await readFile(command.inputPath, 'utf8')).targets;
  } catch (error) {
    if (error instanceof TargetsError) {
      process.stderr.write(`${command.inputPath}: ${error.message}\n`);
      return 3;
    }
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not read ${command.inputPath}: ${message}\n`);
    return 3;
  }

  // A shorter run is allowed; a shorter run described as the whole list is not. Both numbers go
  // into the results file, and the summary says out loud that the rest were left untouched.
  const available = targets.length;
  const limit = command.limit;
  if (limit !== undefined && limit < available) targets = targets.slice(0, limit);

  const subsetNote =
    targets.length < available ? ` (the first ${targets.length} of ${available} on the list)` : '';
  process.stderr.write(
    `Scanning ${targets.length} homepage(s)${subsetNote}, one at a time, identifying as:\n` +
      `  ${USER_AGENT}\n\n`,
  );

  const options: Parameters<typeof runCampaign>[1] = {
    delayMs: command.delayMs,
    siteTimeoutMs: command.siteTimeoutMs,
    screenshots: command.screenshots,
    onProgress: campaignProgress,
  };
  if (command.screenshots) options.screenshotDirectory = path.join(command.outDirectory, 'screenshots');
  if (command.screenshots) await mkdir(options.screenshotDirectory ?? '.', { recursive: true });

  const run = await runCampaign(targets, options);
  const aggregate = aggregateCampaign(run);

  await mkdir(command.outDirectory, { recursive: true });
  const outPath = path.join(command.outDirectory, `campaign-${today()}.json`);
  const document = {
    ...run,
    targetList: { path: command.inputPath, available, attempted: targets.length },
    aggregate,
  };
  await writeFile(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const { scanned, disallowed, skipped, failed } = aggregate.outcomes;
  process.stderr.write(
    `\n${scanned} scanned · ${disallowed} disallowed by robots.txt · ${skipped} skipped · ` +
      `${failed} failed\n` +
      `axe-core reported ${aggregate.layers.standard.elements} element(s); ` +
      `GlyphLint reported ${aggregate.layers.scriptAware.elements}.\n` +
      `Percentages in the results are out of the ${aggregate.percentagesAreOutOf} site(s) scanned.\n` +
      `Results written to ${outPath}\n`,
  );

  const code = scanned === 0 ? 2 : nonZero(aggregate);

  // A scan that ran past the site timeout was abandoned rather than cancelled, and it still holds
  // a browser open, which would keep Node alive long after the results were written. The output is
  // flushed first, then the process ends on the code it earned — a campaign that has already saved
  // its results must not look like it is hanging.
  if (run.abandonedScans > 0) {
    process.stderr.write(
      `${run.abandonedScans} scan(s) were given up on and are still finishing in the background; ` +
        'exiting now that the results are written.\n',
    );
    await flushStderr();
    process.exit(code);
  }

  return code;
}

/** 1 when either layer reported anything at all, 0 when the campaign came back clean. */
function nonZero(aggregate: ReturnType<typeof aggregateCampaign>): number {
  const found = aggregate.layers.standard.elements + aggregate.layers.scriptAware.elements;
  return found > 0 ? 1 : 0;
}

/** Wait for stderr to drain, so an explicit exit cannot truncate what was just written. */
function flushStderr(): Promise<void> {
  return new Promise((resolve) => {
    process.stderr.write('', () => {
      resolve();
    });
  });
}

export async function runCli(argv: readonly string[]): Promise<number> {
  let command;
  try {
    command = parseArguments(argv);
  } catch (error) {
    if (!(error instanceof UsageError)) throw error;
    process.stderr.write(`${error.message}\n\n${USAGE}\n`);
    return 3;
  }

  if (command.kind === 'help') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  if (command.kind === 'rules') {
    process.stdout.write(renderRulesTable());
    return 0;
  }

  if (command.kind === 'campaign') return runCampaignCommand(command);

  return runScan(command);
}

runCli(process.argv.slice(2)).then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Nothing should reach here: `scanUrl` converts page failures into results, and parsing
    // failures are `UsageError`s. If something does, it is a bug in GlyphLint, and saying so is
    // more honest than printing a trace at somebody who scanned a web page.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`GlyphLint hit an internal error and could not continue: ${message}\n`);
    process.exitCode = 2;
  },
);
