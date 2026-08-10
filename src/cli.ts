#!/usr/bin/env node
/**
 * The command line.
 *
 * Argument parsing is done by hand against `process.argv`. A CLI framework would be a runtime
 * dependency, and the surface here is one command with two flags — the framework would be
 * larger than the thing it parses.
 */

// Imported rather than taken from the global scope: this is the one file that is Node-specific,
// and saying so explicitly keeps it working regardless of how ambient types are configured.
import process from 'node:process';

import { scanUrl } from './scanner/scan.js';
import type { ScanOptions } from './types.js';

const USAGE = `glyphlint — accessibility checks that only appear when your text isn't English.

Usage:
  glyphlint scan <url> [--screenshot <path>] [--timeout <ms>]

Options:
  --screenshot <path>  Write a full-page screenshot to <path>.
  --timeout <ms>       Hard limit on page load. Defaults to 20000.

Output is a JSON ScanResult on stdout. axe-core's findings appear under "standard";
script-aware findings appear under "scriptAware".`;

interface ParsedArguments {
  url: string;
  options: ScanOptions;
}

/** Read a flag that takes a value, or fail with a sentence rather than an exception. */
function valueFor(flag: string, argv: string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`${flag} needs a value.`);
  }
  return value;
}

function parseArguments(argv: string[]): ParsedArguments {
  const [command, ...rest] = argv;

  if (command !== 'scan') {
    throw new Error(command === undefined ? 'No command given.' : `Unknown command: ${command}`);
  }

  let url: string | undefined;
  const options: ScanOptions = {};

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === undefined) continue;

    if (argument === '--screenshot') {
      options.screenshotPath = valueFor(argument, rest, index);
      index += 1;
    } else if (argument === '--timeout') {
      const raw = valueFor(argument, rest, index);
      const timeout = Number(raw);
      if (!Number.isFinite(timeout) || timeout <= 0) {
        throw new Error(`--timeout needs a positive number of milliseconds, not "${raw}".`);
      }
      options.timeoutMs = timeout;
      index += 1;
    } else if (argument.startsWith('--')) {
      throw new Error(`Unknown option: ${argument}`);
    } else if (url === undefined) {
      url = argument;
    } else {
      throw new Error(`Only one URL can be scanned at a time. Got "${url}" and "${argument}".`);
    }
  }

  if (url === undefined) throw new Error('No URL given.');
  return { url, options };
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);

  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  let parsed: ParsedArguments;
  try {
    parsed = parseArguments(argv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n\n${USAGE}\n`);
    return 2;
  }

  const result = await scanUrl(parsed.url, parsed.options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  // A page in a writing system we do not model produces no findings at all, which on stdout is
  // indistinguishable from a clean page. Saying nothing here would be the same false silence
  // this project exists to complain about, so it is said out loud — on stderr, so that piping
  // stdout to a file still yields valid JSON, and without changing the exit code, because an
  // acknowledged limit is not a failed run.
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

  // A page that could not be scanned is a failure of the run, not of the tool. The message goes
  // to stderr so that piping stdout into a file still yields valid JSON.
  if (result.error !== undefined) {
    process.stderr.write(`\n${result.error.message}\n`);
    return 1;
  }

  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    // Nothing should reach here: scanUrl converts page failures into results. If something
    // does, it is a bug in GlyphLint, and saying so is more honest than printing a trace.
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`GlyphLint hit an internal error and could not continue: ${message}\n`);
    process.exitCode = 3;
  },
);
