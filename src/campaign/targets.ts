/**
 * The target list, and what its labels mean.
 *
 * Pure: this file validates a value that has already been parsed from JSON. Reading the file is
 * the CLI's job, so a malformed target list can be tested without touching a disk.
 *
 * The `script` field carries the group names the campaign specification uses — `arabic`,
 * `persian/urdu`, `hebrew`, `thai`, `devanagari`, `vietnamese`, `cjk`. Those are language groups
 * rather than writing systems, and the difference is not a technicality: Persian and Urdu are
 * written in the Arabic script, `cjk` covers three separate scripts, and Vietnamese is Latin with
 * heavy diacritics (decision 003). So the label says **why a site is on the list**, and the scan
 * says **what the page is actually written in**. `EXPECTED_SCRIPTS` below is the bridge between
 * the two, and the aggregate reports where they disagree instead of trusting the label.
 */

import type { ScriptId } from '../types.js';

/** The seven groups the campaign specification distributes its thirty homepages across. */
export const TARGET_GROUPS = [
  'arabic',
  'persian/urdu',
  'hebrew',
  'thai',
  'devanagari',
  'vietnamese',
  'cjk',
] as const;

export type TargetGroup = (typeof TARGET_GROUPS)[number];

/**
 * The writing systems a page in each group should turn out to be written in.
 *
 * Used only to notice a target that is not what the list claims — a `thai` entry whose homepage
 * carries no Thai at all is worth knowing about before its numbers go into a README.
 */
export const EXPECTED_SCRIPTS: Readonly<Record<TargetGroup, readonly ScriptId[]>> = {
  arabic: ['arabic'],
  'persian/urdu': ['arabic'],
  hebrew: ['hebrew'],
  thai: ['thai'],
  devanagari: ['devanagari'],
  // Vietnamese is Latin. The stacked-diacritic profile is detected per node, not per script.
  vietnamese: ['latin'],
  cjk: ['han', 'kana', 'hangul'],
};

export interface CampaignTarget {
  url: string;
  script: TargetGroup;
  /** A human note, such as `news` or `government`. Optional, and never used in a calculation. */
  note?: string;
}

export interface CampaignTargets {
  targets: CampaignTarget[];
}

/** A problem with the target list, phrased so that the person who wrote it can fix it. */
export class TargetsError extends Error {
  override readonly name = 'TargetsError';
}

function asRecord(value: unknown, where: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TargetsError(`${where} must be an object.`);
  }
  return value as Record<string, unknown>;
}

/**
 * Validate a parsed target list.
 *
 * Strict on purpose. A campaign is thirty requests to other people's servers, and the moment to
 * find a typo in a URL is before the first one, not in a results file afterwards.
 */
export function parseTargets(value: unknown): CampaignTargets {
  const root = asRecord(value, 'The targets file');
  const list = root['targets'];

  if (!Array.isArray(list)) {
    throw new TargetsError('The targets file must have a "targets" array.');
  }
  if (list.length === 0) {
    throw new TargetsError('The targets file lists no targets.');
  }

  const targets: CampaignTarget[] = [];
  const seen = new Set<string>();

  for (const [index, entry] of list.entries()) {
    const where = `Target ${index + 1}`;
    const record = asRecord(entry, where);

    const url = record['url'];
    if (typeof url !== 'string' || url.trim() === '') {
      throw new TargetsError(`${where} needs a "url".`);
    }

    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new TargetsError(`${where} has a url that is not a URL: "${url}".`);
    }
    // Only what a browser can be pointed at over the network. A `file:` or `data:` target would
    // not be a homepage, and this tool scans homepages.
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new TargetsError(`${where} must be http or https, not "${parsed.protocol}".`);
    }

    const key = parsed.href;
    if (seen.has(key)) {
      throw new TargetsError(`${where} repeats a URL already on the list: ${key}`);
    }
    seen.add(key);

    const script = record['script'];
    const group = TARGET_GROUPS.find((candidate) => candidate === script);
    if (group === undefined) {
      throw new TargetsError(
        `${where} has script "${String(script)}". It must be one of: ${TARGET_GROUPS.join(', ')}.`,
      );
    }

    const note = record['note'];
    if (note !== undefined && typeof note !== 'string') {
      throw new TargetsError(`${where} has a note that is not a string.`);
    }

    const target: CampaignTarget = { url, script: group };
    if (typeof note === 'string' && note !== '') target.note = note;
    targets.push(target);
  }

  return { targets };
}

/**
 * Read a target list from the text of a file.
 *
 * Pure, and it exists for one reason found the hard way: on Windows, a file written by PowerShell
 * or Notepad begins with a byte order mark, and `JSON.parse` rejects it with a message about an
 * unexpected token that names a character nobody can see. This project promises its commands work
 * on Windows, so the mark is stripped here rather than being explained in an issue later.
 */
export function parseTargetsFile(text: string): CampaignTargets {
  const withoutMark = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  let value: unknown;
  try {
    value = JSON.parse(withoutMark);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new TargetsError(`The targets file is not valid JSON: ${detail}`);
  }

  return parseTargets(value);
}

/** How many targets each group holds, for checking a list against the planned distribution. */
export function countByGroup(targets: readonly CampaignTarget[]): Record<TargetGroup, number> {
  const counts = Object.fromEntries(TARGET_GROUPS.map((group) => [group, 0])) as Record<
    TargetGroup,
    number
  >;

  for (const target of targets) counts[target.script] += 1;
  return counts;
}
