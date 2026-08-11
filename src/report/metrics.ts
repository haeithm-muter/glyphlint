/**
 * The README numbers, generated from the results file.
 *
 * The rule this file exists to enforce: **a number a script cannot reproduce does not go in the
 * README.** Everything between the two markers is written by `renderMetricsBlock` from a committed
 * campaign document, so anyone can run `npm run metrics` and see the block come back identical —
 * or see it change, which would mean the numbers had drifted from the evidence.
 *
 * Pure. Reading the results file and writing the README are `src/metrics.ts`, the shell.
 *
 * Three things the block is careful about, because all three are ways a campaign can flatter
 * itself:
 *
 * - **The denominator is printed beside every percentage.** Seven sites answered; a percentage out
 *   of seven is not a percentage out of the ten targets, and it is certainly not a percentage of
 *   the web.
 * - **A site that answered is not a site that was measured.** A homepage that served us an error
 *   page carries no writing system to check, and the block names those sites rather than leaving
 *   them inside a total.
 * - **The two layers are never summed or divided.** They count different things — axe counts
 *   elements failing its rules, we count text nodes failing ours — so a ratio between them would
 *   be arithmetic performed on two different units.
 */

import type { CampaignAggregate } from '../campaign/aggregate.js';
import type { CampaignRun } from '../campaign/runner.js';

/** The document `glyphlint campaign` writes, and the only input these numbers come from. */
export interface CampaignDocument extends CampaignRun {
  targetList: {
    path: string;
    /** Targets on the list. */
    available: number;
    /** Targets this run actually attempted. */
    attempted: number;
  };
  aggregate: CampaignAggregate;
}

export const METRICS_START = '<!-- METRICS:START -->';
export const METRICS_END = '<!-- METRICS:END -->';

/**
 * The rule the project's pitch is built on.
 *
 * Named here so the generated caveat can report how it actually did. A project that leads with one
 * finding owes its reader that finding's real numbers, especially when they are small.
 */
const FLAGSHIP_RULE_ID = 'cursive-script-letter-spacing';

/** A problem with the README rather than with the numbers. */
export class MetricsError extends Error {
  override readonly name = 'MetricsError';
}

/** `2026-08-11` from an ISO timestamp, because the day is the part a reader needs. */
function dayOf(timestamp: string): string {
  return timestamp.slice(0, 10);
}

/**
 * Sites that answered with a page in the writing system they were listed for.
 *
 * Derived rather than typed in: a scanned site whose content did not match its group is already
 * recorded as a label mismatch, and subtracting those is what turns "seven answered" into "five
 * were measured". If the derivation ever disagrees with the file, the file wins, because it is
 * the thing that was measured.
 */
function measuredSites(aggregate: CampaignAggregate): number {
  return Math.max(0, aggregate.outcomes.scanned - aggregate.labelMismatches.length);
}

/**
 * The paragraph a campaign would rather not print.
 *
 * Every figure in it is computed from the same rows as the table above, for one reason: a caveat
 * written by hand drifts away from the numbers it qualifies, and the first person to notice is a
 * reader checking whether this project means what it says. Generated, it cannot drift.
 *
 * The three points are the ones the evidence actually raises — the flagship rule barely firing,
 * most of the volume coming from rules that do not claim certainty, and the two layers counting
 * different things.
 */
export interface Caveat {
  heading: string;
  body: string;
}

/** The heading both renderers put above the caveats. */
export const CAVEATS_HEADING = 'What these numbers do not say';

export function campaignCaveats(
  aggregate: CampaignAggregate,
  flagshipRuleId: string = FLAGSHIP_RULE_ID,
): Caveat[] {
  const ours = aggregate.issues.scriptAware;
  const total = aggregate.layers.scriptAware.elements;

  const flagship = ours.find((issue) => issue.ruleId === flagshipRuleId);
  const certainElements = ours
    .filter((issue) => issue.confidence === 'high')
    .reduce((sum, issue) => sum + issue.elements, 0);
  const [first, second] = ours;

  const caveats: Caveat[] = [];

  if (flagship !== undefined) {
    const sites = flagship.sites === 1 ? '1 site' : `${flagship.sites} sites`;
    const elements = flagship.elements === 1 ? '1 element' : `${flagship.elements} elements`;
    caveats.push({
      heading: 'The rule this project was built around barely fired.',
      body:
        `${flagshipRuleId} — letter spacing severing the joins in a cursive script — found ` +
        `${elements} on ${sites}. The major publishers scanned here do not put letter spacing on ` +
        'their cursive text. That is a real result and it is published as it stands: the defect ' +
        'is rare on professionally built sites, which is not the same as harmless where it does ' +
        'happen.',
    });
  }

  if (first !== undefined && second !== undefined && total > 0) {
    const share = percentageOf(first.elements + second.elements, total);
    caveats.push({
      heading: 'Most of the volume comes from rules that do not claim certainty.',
      body:
        `The two largest, ${first.ruleId} (${first.confidence ?? 'unrated'}) and ${second.ruleId} ` +
        `(${second.confidence ?? 'unrated'}), account for ${first.elements + second.elements} of ` +
        `${total} elements — ${share}% of everything GlyphLint reported. Only ${certainElements} ` +
        'element(s) came from rules marked high confidence. A large total is not a large number ' +
        'of confirmed defects, and this one should not be read as one.',
    });
  }

  caveats.push({
    heading: 'The two layers are counted in different units, so the comparison is not a score.',
    body:
      'axe-core counts elements failing its rules. GlyphLint counts text nodes failing ours. ' +
      'Whichever number is larger, dividing one by the other produces nothing, and this project ' +
      'does not publish that division.',
  });

  return caveats;
}

/** The caveats as markdown, for the README block. */
function caveats(aggregate: CampaignAggregate, flagshipRuleId: string): string[] {
  const lines = [`### ${CAVEATS_HEADING}`, ''];

  for (const caveat of campaignCaveats(aggregate, flagshipRuleId)) {
    lines.push(`**${caveat.heading}** ${caveat.body}`, '');
  }

  return lines;
}

/** One decimal place, matching the rounding the aggregate already uses. */
function percentageOf(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function issueTable(aggregate: CampaignAggregate): string[] {
  const lines = [
    '| Rule | Sites | Of the sites scanned | Elements | Severity | Confidence |',
    '|---|---|---|---|---|---|',
  ];

  for (const issue of aggregate.issues.scriptAware) {
    lines.push(
      `| \`${issue.ruleId}\` | ${issue.sites} | ${issue.sitesPercent}% | ${issue.elements} | ` +
        `${issue.severity} | ${issue.confidence ?? '—'} |`,
    );
  }

  return lines;
}

/**
 * Render the block that lives between the markers.
 *
 * Every number here is read out of the document. Nothing is rounded up, nothing is combined across
 * the two layers, and the sentences that qualify the numbers are part of the generated text rather
 * than prose someone might edit away from the figures they qualify.
 */
export function renderMetricsBlock(document: CampaignDocument): string {
  const { aggregate, targetList } = document;
  const { outcomes } = aggregate;
  const scanned = outcomes.scanned;
  const measured = measuredSites(aggregate);

  const mismatched = aggregate.labelMismatches.map((entry) => entry.url);

  const lines: string[] = [
    `_Generated by \`npm run metrics\` from \`results/campaign-${dayOf(document.startedAt)}.json\`.`,
    'Do not edit by hand._',
    '',
    `**${targetList.attempted} targets attempted** out of ${targetList.available} on the list · ` +
      `**${scanned} answered** · **${measured} served a page in the writing system they were ` +
      'listed for**.',
    '',
    '| Outcome | Sites |',
    '|---|---|',
    `| Scanned | ${outcomes.scanned} |`,
    `| Disallowed by robots.txt | ${outcomes.disallowed} |`,
    `| Skipped, permission could not be established | ${outcomes.skipped} |`,
    `| Failed (timeout or error) | ${outcomes.failed} |`,
    '',
  ];

  if (mismatched.length > 0) {
    lines.push(
      `${mismatched.length} of the ${scanned} sites that answered did not serve their homepage ` +
        'to a scanner that identifies itself honestly. They are counted as scanned and excluded ' +
        `from the measured figure above: ${mismatched.join(', ')}.`,
      '',
    );
  }

  lines.push(
    '### The two layers, side by side',
    '',
    '| | Rules that reported | Elements reported | Sites with findings |',
    '|---|---|---|---|',
    `| Standard rules (axe-core) | ${aggregate.layers.standard.rules} | ` +
      `${aggregate.layers.standard.elements} | ${aggregate.layers.standard.sitesWithFindings} |`,
    `| Script-aware rules (GlyphLint) | ${aggregate.layers.scriptAware.rules} | ` +
      `${aggregate.layers.scriptAware.elements} | ${aggregate.layers.scriptAware.sitesWithFindings} |`,
    '',
    '**These two numbers are not comparable and are not compared here.** axe-core counts elements ' +
      'failing its own rules; GlyphLint counts text nodes failing ours. A page with one styled ' +
      'container holding forty paragraphs is one element to axe and forty text nodes to us. The ' +
      'columns are printed side by side because the specification asks for both, not because one ' +
      'divided by the other means anything.',
    '',
    '### What GlyphLint found, ranked',
    '',
    `Percentages are out of the ${aggregate.percentagesAreOutOf} sites that were scanned — not out ` +
      `of the ${targetList.attempted} attempted, and not out of the web.`,
    '',
    ...issueTable(aggregate),
    '',
    `axe-core reported ${aggregate.layers.standard.elements} elements across ` +
      `${aggregate.layers.standard.rules} of its own rules on the same pages, and passed ` +
      `${aggregate.layers.standard.passes} checks. Those findings are axe's work, not ours.`,
    '',
    ...caveats(aggregate, FLAGSHIP_RULE_ID),
  );

  return lines.join('\n');
}

/**
 * Put the block into a README between its markers.
 *
 * Refuses to guess. A README missing a marker is a README this function will not edit, because the
 * alternative is appending numbers somewhere nobody expected them.
 */
export function spliceMetricsBlock(readme: string, block: string): string {
  const start = readme.indexOf(METRICS_START);
  const end = readme.indexOf(METRICS_END);

  if (start === -1 || end === -1) {
    throw new MetricsError(
      `The README needs both ${METRICS_START} and ${METRICS_END} for the numbers to go between.`,
    );
  }
  if (end < start) {
    throw new MetricsError(`${METRICS_END} appears before ${METRICS_START} in the README.`);
  }

  const before = readme.slice(0, start + METRICS_START.length);
  const after = readme.slice(end);

  return `${before}\n${block}\n${after}`;
}
