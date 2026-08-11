/**
 * Argument parsing, kept pure and kept separate.
 *
 * `cli.ts` is the impure shell: it reads `process.argv`, launches a browser, writes files and
 * chooses an exit code. This file is a function from an array of strings to a description of what
 * was asked for, which means the whole command surface can be tested without starting anything.
 *
 * Parsing is done by hand. A CLI framework would be a runtime dependency, and the surface here is
 * three commands — the framework would be larger than the thing it parses.
 */

import { RULES } from './rules/index.js';
import { SCRIPT_PROPERTIES } from './scripts/properties.js';
import type { DetectableScript, FilterOptions, ScriptId, Severity } from './types.js';

export type OutputFormat = 'terminal' | 'json' | 'html';

/** Where the screenshot goes, or that it does not happen. */
export type ScreenshotChoice =
  /** Written beside the report, or named after the host when there is no report file. */
  | { mode: 'default' }
  | { mode: 'off' }
  | { mode: 'path'; path: string };

export interface ScanCommand {
  kind: 'scan';
  url: string;
  format: OutputFormat;
  /** Absent means write the report to stdout. */
  outPath?: string;
  screenshot: ScreenshotChoice;
  timeoutMs?: number;
  filters: FilterOptions;
  /**
   * Ids in `--rules` or `--disable` that name no GlyphLint rule.
   *
   * Not an error: the same options are matched against axe-core's rule ids, and we hold no list of
   * those — axe owns its registry, and hard-coding a copy of it here would be wrong within a
   * release. The CLI says out loud which ids it did not recognise, so a typo is visible rather
   * than silent.
   */
  unrecognisedRuleIds: string[];
}

export interface CampaignCommand {
  kind: 'campaign';
  /** The target list. Required: a campaign with no list is not a campaign. */
  inputPath: string;
  /** Directory the results file is written into. Defaults to `results/`. */
  outDirectory: string;
  /**
   * Milliseconds between sites.
   *
   * A floor, not a setting: the runner raises anything below 2000 for any host that is not
   * loopback. Passing a smaller number here does not make the campaign faster, and the help text
   * says so rather than letting someone discover it from the timing.
   */
  delayMs: number;
  siteTimeoutMs: number;
  screenshots: boolean;
  /**
   * Scan only the first N targets on the list.
   *
   * For a shorter run without editing the target list, which matters because the list is a
   * committed artefact and a campaign is allowed to be smaller than it. The results file records
   * both numbers — how many targets the list held and how many were attempted — so a run of ten
   * out of thirty can never be reported as a run of thirty.
   */
  limit?: number;
}

export interface RulesCommand {
  kind: 'rules';
}

export interface HelpCommand {
  kind: 'help';
}

export type Command = ScanCommand | CampaignCommand | RulesCommand | HelpCommand;

/** A problem with what the user typed, as opposed to a problem with the page. Exit code 3. */
export class UsageError extends Error {
  override readonly name = 'UsageError';
}

const FORMATS: readonly OutputFormat[] = ['terminal', 'json', 'html'];
const SEVERITY_LEVELS: readonly Severity[] = ['critical', 'serious', 'moderate', 'minor'];

/** The sixteen writing systems the script layer models, read from the property table itself. */
function detectableScripts(): DetectableScript[] {
  return (Object.keys(SCRIPT_PROPERTIES) as DetectableScript[]).sort();
}

export const USAGE = `glyphlint — the accessibility checks that only appear when your text isn't English.

Usage:
  glyphlint scan <url> [options]
  glyphlint campaign --input <path> [options]
  glyphlint rules

Options for scan:
  --format <terminal|json|html>  Output format. Default: terminal.
  --out <path>                   Write the report here instead of stdout.
  --rules <ids>                  Comma-separated allow-list: report only these rules.
  --disable <ids>                Comma-separated deny-list: report everything except these.
  --scripts <ids>                Comma-separated: report only these writing systems.
  --min-severity <level>         One of critical, serious, moderate, minor.
  --timeout <ms>                 Hard limit on page load. Default: 20000.
  --screenshot <path>            Write the full-page screenshot here.
  --no-screenshot                Do not take a screenshot.
  -h, --help                     Print this text.

Options for campaign:
  --input <path>                 Target list, as described in the campaign specification.
  --out <path>                   Directory for campaign-<date>.json. Default: results.
  --delay <ms>                   Pause between sites. Default and minimum: 2000.
  --site-timeout <ms>            Give up on one site after this. Default: 60000.
  --screenshots                  Save a screenshot per site. Off by default.
  --limit <n>                    Scan only the first n targets on the list.

A campaign scans homepages only, one at a time, never faster than one site every two seconds.
It fetches robots.txt first and does not scan a site that refuses or cannot answer, recording
either outcome in the results. One site failing never stops the run.

How the filters apply:
  --rules, --disable and --min-severity narrow both layers of the report. Rule ids are matched
  against axe-core's rules as well as GlyphLint's, and the severity floor reads axe's own impact
  value without re-scoring it. --scripts narrows GlyphLint findings only, because an axe-core
  finding carries no writing system for the filter to read. Whatever a filter withholds is
  counted and printed in the report, so a narrowed report never reads as a cleaner page.

Exit codes:
  0  no violations
  1  violations found
  2  the page could not be scanned
  3  invalid usage

axe-core's findings appear under "standard" and are reproduced unchanged. GlyphLint's own
script-aware findings appear under "scriptAware". The two are never added together.`;

/** Read a flag that takes a value, or fail with a sentence rather than an exception nobody reads. */
function valueFor(flag: string, argv: readonly string[], index: number): string {
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) {
    throw new UsageError(`${flag} needs a value.`);
  }
  return value;
}

/** Split `a,b , c` into ids, rejecting a list that turns out to be empty. */
function idList(flag: string, raw: string): string[] {
  const ids = raw
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id !== '');

  if (ids.length === 0) throw new UsageError(`${flag} needs at least one id.`);
  return ids;
}

function parseFormat(raw: string): OutputFormat {
  const format = FORMATS.find((candidate) => candidate === raw);
  if (format === undefined) {
    throw new UsageError(`--format must be one of ${FORMATS.join(', ')}, not "${raw}".`);
  }
  return format;
}

function parseSeverity(raw: string): Severity {
  const severity = SEVERITY_LEVELS.find((candidate) => candidate === raw);
  if (severity === undefined) {
    throw new UsageError(
      `--min-severity must be one of ${SEVERITY_LEVELS.join(', ')}, not "${raw}".`,
    );
  }
  return severity;
}

/**
 * Writing systems, validated against the ones we actually model.
 *
 * `common` and `unknown` are rejected even though they are `ScriptId`s. They are outcomes, not
 * writing systems, and no finding ever carries them — accepting them would hand the user a filter
 * that silently matches nothing.
 */
function parseScripts(raw: string): ScriptId[] {
  const known = detectableScripts();
  const scripts: ScriptId[] = [];

  for (const id of idList('--scripts', raw)) {
    const match = known.find((candidate) => candidate === id);
    if (match === undefined) {
      throw new UsageError(
        `--scripts does not know "${id}". GlyphLint models: ${known.join(', ')}. ` +
          'Writing systems outside that list are reported as unsupported rather than filtered.',
      );
    }
    scripts.push(match);
  }

  return scripts;
}

/** Ids in a filter list that no rule of ours answers to. Order and duplicates are preserved. */
function unrecognised(ids: readonly string[]): string[] {
  const known = new Set(RULES.map((rule) => rule.id));
  return ids.filter((id) => !known.has(id));
}

/** A positive number of milliseconds, or a sentence explaining what was wrong with the value. */
function millisecondsFor(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new UsageError(`${flag} needs a positive number of milliseconds, not "${raw}".`);
  }
  return value;
}

/**
 * The same, but zero is allowed.
 *
 * Only `--delay` uses this. Zero is a real answer there — it means "no pause of my own" — and the
 * runner still raises it to the two-second floor for every host that is not loopback, so the
 * value that can be typed here and the value that reaches a stranger's server are different
 * things. A timeout of zero, by contrast, would mean "give up immediately", which nobody wants.
 */
function nonNegativeMillisecondsFor(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new UsageError(`${flag} needs a number of milliseconds that is not negative, not "${raw}".`);
  }
  return value;
}

/**
 * Parse `glyphlint campaign`.
 *
 * `--delay` is accepted below 2000 rather than rejected, because the runner raises it and saying
 * so in the help text is friendlier than failing on a number somebody typed hopefully. What is
 * rejected is a campaign with no target list: the specification is built around one, and inventing
 * a default list of other people's websites is not a thing this tool gets to do.
 */
function parseCampaign(argv: readonly string[]): CampaignCommand {
  let inputPath: string | undefined;
  let outDirectory = 'results';
  let delayMs = 2000;
  let siteTimeoutMs = 60_000;
  let screenshots = false;
  let limit: number | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === undefined) continue;

    if (argument === '--input') {
      inputPath = valueFor(argument, argv, index);
      index += 1;
    } else if (argument === '--out') {
      outDirectory = valueFor(argument, argv, index);
      index += 1;
    } else if (argument === '--delay') {
      delayMs = nonNegativeMillisecondsFor(argument, valueFor(argument, argv, index));
      index += 1;
    } else if (argument === '--site-timeout') {
      siteTimeoutMs = millisecondsFor(argument, valueFor(argument, argv, index));
      index += 1;
    } else if (argument === '--screenshots') {
      screenshots = true;
    } else if (argument === '--limit') {
      const raw = valueFor(argument, argv, index);
      const value = Number(raw);
      if (!Number.isInteger(value) || value <= 0) {
        throw new UsageError(`--limit needs a whole number of sites above zero, not "${raw}".`);
      }
      limit = value;
      index += 1;
    } else {
      throw new UsageError(
        argument.startsWith('--')
          ? `Unknown option: ${argument}`
          : `campaign takes options only, not "${argument}". The target list goes in --input.`,
      );
    }
  }

  if (inputPath === undefined) {
    throw new UsageError('campaign needs --input <path> pointing at a target list.');
  }

  const campaign: CampaignCommand = {
    kind: 'campaign',
    inputPath,
    outDirectory,
    delayMs,
    siteTimeoutMs,
    screenshots,
  };
  if (limit !== undefined) campaign.limit = limit;
  return campaign;
}

/**
 * Turn the arguments into a command.
 *
 * Throws `UsageError` and nothing else. Every message is a sentence a person can act on, because
 * the alternative — printing a stack trace at somebody who mistyped a flag — is the sort of thing
 * this project spends its time complaining about elsewhere.
 */
export function parseArguments(argv: readonly string[]): Command {
  const [command, ...rest] = argv;

  if (command === undefined) throw new UsageError('No command given.');
  if (command === '--help' || command === '-h' || command === 'help') return { kind: 'help' };

  if (command === 'rules') {
    if (rest.length > 0) throw new UsageError(`rules takes no arguments. Got "${rest[0] ?? ''}".`);
    return { kind: 'rules' };
  }

  if (command === 'campaign') return parseCampaign(rest);

  if (command !== 'scan') throw new UsageError(`Unknown command: ${command}`);

  let url: string | undefined;
  let format: OutputFormat = 'terminal';
  let outPath: string | undefined;
  let timeoutMs: number | undefined;
  let screenshot: ScreenshotChoice = { mode: 'default' };
  const filters: FilterOptions = {};
  const filterRuleIds: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const argument = rest[index];
    if (argument === undefined) continue;

    if (argument === '--help' || argument === '-h') return { kind: 'help' };

    if (argument === '--format') {
      format = parseFormat(valueFor(argument, rest, index));
      index += 1;
    } else if (argument === '--out') {
      outPath = valueFor(argument, rest, index);
      index += 1;
    } else if (argument === '--rules') {
      const ids = idList(argument, valueFor(argument, rest, index));
      filters.onlyRules = ids;
      filterRuleIds.push(...ids);
      index += 1;
    } else if (argument === '--disable') {
      const ids = idList(argument, valueFor(argument, rest, index));
      filters.disabledRules = ids;
      filterRuleIds.push(...ids);
      index += 1;
    } else if (argument === '--scripts') {
      filters.onlyScripts = parseScripts(valueFor(argument, rest, index));
      index += 1;
    } else if (argument === '--min-severity') {
      filters.minSeverity = parseSeverity(valueFor(argument, rest, index));
      index += 1;
    } else if (argument === '--timeout') {
      timeoutMs = millisecondsFor(argument, valueFor(argument, rest, index));
      index += 1;
    } else if (argument === '--screenshot') {
      screenshot = { mode: 'path', path: valueFor(argument, rest, index) };
      index += 1;
    } else if (argument === '--no-screenshot') {
      screenshot = { mode: 'off' };
    } else if (argument.startsWith('--')) {
      throw new UsageError(`Unknown option: ${argument}`);
    } else if (url === undefined) {
      url = argument;
    } else {
      throw new UsageError(`Only one URL can be scanned at a time. Got "${url}" and "${argument}".`);
    }
  }

  if (url === undefined) throw new UsageError('No URL given.');

  const scan: ScanCommand = {
    kind: 'scan',
    url,
    format,
    screenshot,
    filters,
    unrecognisedRuleIds: unrecognised(filterRuleIds),
  };
  if (outPath !== undefined) scan.outPath = outPath;
  if (timeoutMs !== undefined) scan.timeoutMs = timeoutMs;

  return scan;
}
