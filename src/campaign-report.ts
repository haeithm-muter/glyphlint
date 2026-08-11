#!/usr/bin/env node
/**
 * Render the published campaign report from committed results.
 *
 * `node dist/campaign-report.js <results directory> <output directory>`
 *
 * The impure shell the deploy workflow runs. It reads a results file that a person already reviewed
 * and committed, renders a static page, and writes it as `index.html`. It scans nothing, contacts
 * nothing, and needs no browser — which is exactly why publishing can be automated while scanning
 * cannot. See decision 024.
 */

import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

import { renderCampaignReport } from './report/campaign-html.js';
import type { CampaignDocument } from './report/metrics.js';

async function newestResultsFile(directory: string): Promise<string> {
  const entries = await readdir(directory);
  const campaigns = entries.filter((name) => /^campaign-.*\.json$/u.test(name)).sort();
  const newest = campaigns[campaigns.length - 1];

  if (newest === undefined) {
    throw new Error(`No campaign-<date>.json in ${directory}/. Nothing to publish.`);
  }

  return path.join(directory, newest);
}

async function main(): Promise<number> {
  const resultsDirectory = process.argv[2] ?? 'results';
  const outDirectory = process.argv[3] ?? 'public';

  const resultsPath = await newestResultsFile(resultsDirectory);
  const document = JSON.parse(await readFile(resultsPath, 'utf8')) as CampaignDocument;

  if (document.aggregate === undefined) {
    throw new Error(`${resultsPath} has no aggregate, so there is nothing to render.`);
  }

  await mkdir(outDirectory, { recursive: true });
  const outPath = path.join(outDirectory, 'index.html');
  await writeFile(outPath, renderCampaignReport(document), 'utf8');

  process.stdout.write(`Campaign report rendered from ${resultsPath} to ${outPath}.\n`);
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`Could not render the campaign report: ${message}\n`);
    process.exitCode = 1;
  },
);
