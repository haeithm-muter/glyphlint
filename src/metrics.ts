#!/usr/bin/env node
/**
 * `npm run metrics` — regenerate the README numbers from a committed results file.
 *
 * The impure shell around `report/metrics.ts`: it finds the newest campaign document, renders the
 * block, and writes it back between the markers. Nothing here decides what a number is.
 *
 * Run it after a campaign, and run it again before publishing anything: if the block changes, the
 * README had drifted from the evidence, and the evidence wins.
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import {
  MetricsError,
  renderMetricsBlock,
  spliceMetricsBlock,
  type CampaignDocument,
} from './report/metrics.js';

const RESULTS_DIRECTORY = 'results';
const README = 'README.md';

/**
 * The newest campaign document in `results/`.
 *
 * Newest by filename, which works because the name carries the date it was written. Picking by
 * modification time would let a file copied yesterday outrank the campaign that ran today.
 */
async function newestResultsFile(directory: string): Promise<string> {
  let entries: string[];
  try {
    entries = await readdir(directory);
  } catch {
    throw new MetricsError(
      `No ${directory}/ directory. Run a campaign first: npm run campaign -- --input sites/targets.json`,
    );
  }

  const campaigns = entries.filter((name) => /^campaign-.*\.json$/u.test(name)).sort();
  const newest = campaigns[campaigns.length - 1];

  if (newest === undefined) {
    throw new MetricsError(`No campaign-<date>.json in ${directory}/. Run a campaign first.`);
  }

  return path.join(directory, newest);
}

async function main(): Promise<number> {
  const given = process.argv[2];

  let resultsPath: string;
  let readme: string;
  let document: CampaignDocument;

  try {
    resultsPath = given ?? (await newestResultsFile(RESULTS_DIRECTORY));
    document = JSON.parse(await readFile(resultsPath, 'utf8')) as CampaignDocument;
    readme = await readFile(README, 'utf8');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  if (document.aggregate === undefined || document.targetList === undefined) {
    process.stderr.write(
      `${resultsPath} is not a campaign document: it has no aggregate to read numbers from.\n`,
    );
    return 1;
  }

  let updated: string;
  try {
    updated = spliceMetricsBlock(readme, renderMetricsBlock(document));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    return 1;
  }

  if (updated === readme) {
    process.stdout.write(`README numbers already match ${resultsPath}. Nothing changed.\n`);
    return 0;
  }

  await writeFile(README, updated, 'utf8');
  process.stdout.write(`README numbers regenerated from ${resultsPath}.\n`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not regenerate the metrics block: ${message}\n`);
    process.exitCode = 1;
  },
);
