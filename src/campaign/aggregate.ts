/**
 * Turning a campaign into numbers.
 *
 * Pure, and the most dangerous file in the project. Everything a README will eventually claim is
 * computed here, so three rules govern it:
 *
 * 1. **The denominator is stated, never implied.** "Affects 40% of sites" is meaningless until the
 *    reader knows whether that is 40% of the thirty targets or of the twenty-four that could
 *    actually be scanned. `percentagesAreOutOf` is in the output for exactly that reason, and
 *    every percentage here is computed over sites we scanned — not over sites we listed.
 * 2. **The two layers are counted separately, side by side, and never summed.** The comparison is
 *    the point of the campaign; a total would destroy it.
 * 3. **What a target list claims is not evidence.** The group label says why a site was chosen;
 *    `byDetectedScript` reports what the pages turned out to be written in, and
 *    `labelMismatches` names the entries where the two disagree.
 */

import { SCRIPT_LABELS } from '../rules/helpers.js';
import type { Confidence, ScriptId, Severity } from '../types.js';
import type { CampaignRun, SiteRecord, SiteStatus } from './runner.js';
import { EXPECTED_SCRIPTS, TARGET_GROUPS, type TargetGroup } from './targets.js';

/** One rule, and how much of the campaign it turned up in. */
export interface IssueRow {
  source: 'axe-core' | 'glyphlint';
  ruleId: string;
  /** axe's own help text, or our rule title. Never rewritten. */
  title: string;
  severity: Severity | 'ungraded';
  /** Ours only. axe does not publish a confidence and we do not invent one for it. */
  confidence?: Confidence;
  /** Sites where this rule reported at least once. */
  sites: number;
  /** Of the sites that were scanned. See `percentagesAreOutOf`. */
  sitesPercent: number;
  /** Elements reported across the whole campaign. */
  elements: number;
}

export interface LayerTotals {
  sitesWithFindings: number;
  /** Distinct rules that reported anything. */
  rules: number;
  /** Elements reported across every site. */
  elements: number;
}

export interface GroupRow {
  group: TargetGroup;
  listed: number;
  scanned: number;
  sitesWithScriptAwareFindings: number;
  standardElements: number;
  scriptAwareElements: number;
}

export interface DetectedScriptRow {
  script: ScriptId;
  label: string;
  /** Sites where GlyphLint reported at least one finding about this writing system. */
  sites: number;
  findings: number;
}

export interface LabelMismatch {
  url: string;
  /** What the target list said. */
  listedAs: TargetGroup;
  /** What the page turned out to contain, worst-guess first. */
  detected: ScriptId[];
}

export interface CampaignAggregate {
  targets: number;
  outcomes: Record<SiteStatus, number>;
  /**
   * The denominator behind every percentage in this object.
   *
   * Sites that were scanned. A site refused by robots.txt or unreachable was never examined, and
   * counting it as evidence of anything — in either direction — would be inventing data.
   */
  percentagesAreOutOf: number;
  /** Side by side, never added together. */
  layers: {
    standard: LayerTotals & { passes: number };
    scriptAware: LayerTotals;
  };
  issues: {
    standard: IssueRow[];
    scriptAware: IssueRow[];
  };
  byGroup: GroupRow[];
  byDetectedScript: DetectedScriptRow[];
  labelMismatches: LabelMismatch[];
}

/** One decimal place, and an honest zero when there is nothing to divide by. */
export function percentOf(count: number, total: number): number {
  if (total === 0) return 0;
  return Math.round((count / total) * 1000) / 10;
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/** Most widespread first, then the one touching more elements, then by id so ties are stable. */
function rankIssues(rows: IssueRow[]): IssueRow[] {
  return rows.sort(
    (left, right) =>
      right.sites - left.sites ||
      right.elements - left.elements ||
      compareStrings(left.ruleId, right.ruleId),
  );
}

interface Tally {
  title: string;
  severity: Severity | 'ungraded';
  confidence?: Confidence;
  sites: Set<string>;
  elements: number;
}

/** Sites that produced findings, which is the only population any percentage here describes. */
function scannedSites(run: CampaignRun): SiteRecord[] {
  return run.sites.filter((site) => site.status === 'scanned');
}

function aggregateStandard(sites: SiteRecord[], denominator: number): {
  totals: LayerTotals & { passes: number };
  issues: IssueRow[];
} {
  const tallies = new Map<string, Tally>();
  let elements = 0;
  let passes = 0;
  const sitesWithFindings = new Set<string>();

  for (const site of sites) {
    passes += site.standard?.passes ?? 0;

    for (const violation of site.standard?.violations ?? []) {
      const existing = tallies.get(violation.id) ?? {
        // axe's own words. The campaign summarises how often a rule fired, never what it said.
        title: violation.help,
        severity: violation.impact ?? 'ungraded',
        sites: new Set<string>(),
        elements: 0,
      };
      existing.sites.add(site.url);
      existing.elements += violation.nodes.length;
      tallies.set(violation.id, existing);

      elements += violation.nodes.length;
      sitesWithFindings.add(site.url);
    }
  }

  const issues = rankIssues(
    [...tallies.entries()].map(([ruleId, tally]) => ({
      source: 'axe-core' as const,
      ruleId,
      title: tally.title,
      severity: tally.severity,
      sites: tally.sites.size,
      sitesPercent: percentOf(tally.sites.size, denominator),
      elements: tally.elements,
    })),
  );

  return {
    totals: { sitesWithFindings: sitesWithFindings.size, rules: tallies.size, elements, passes },
    issues,
  };
}

function aggregateScriptAware(sites: SiteRecord[], denominator: number): {
  totals: LayerTotals;
  issues: IssueRow[];
  byDetectedScript: DetectedScriptRow[];
} {
  const tallies = new Map<string, Tally>();
  const scripts = new Map<ScriptId, { sites: Set<string>; findings: number }>();
  let elements = 0;
  const sitesWithFindings = new Set<string>();

  for (const site of sites) {
    for (const violation of site.scriptAware?.violations ?? []) {
      const existing = tallies.get(violation.ruleId) ?? {
        title: violation.title,
        severity: violation.severity,
        confidence: violation.confidence,
        sites: new Set<string>(),
        elements: 0,
      };
      existing.sites.add(site.url);
      existing.elements += 1;
      // A rule may grade one finding below another (decision 012); the row shows the worst.
      if (SEVERITY_ORDER[violation.severity] < SEVERITY_ORDER[existing.severity]) {
        existing.severity = violation.severity;
      }
      tallies.set(violation.ruleId, existing);

      const script = scripts.get(violation.script) ?? { sites: new Set<string>(), findings: 0 };
      script.sites.add(site.url);
      script.findings += 1;
      scripts.set(violation.script, script);

      elements += 1;
      sitesWithFindings.add(site.url);
    }
  }

  const issues = rankIssues(
    [...tallies.entries()].map(([ruleId, tally]) => {
      const row: IssueRow = {
        source: 'glyphlint' as const,
        ruleId,
        title: tally.title,
        severity: tally.severity,
        sites: tally.sites.size,
        sitesPercent: percentOf(tally.sites.size, denominator),
        elements: tally.elements,
      };
      if (tally.confidence !== undefined) row.confidence = tally.confidence;
      return row;
    }),
  );

  const byDetectedScript = [...scripts.entries()]
    .map(([script, entry]) => ({
      script,
      label: SCRIPT_LABELS[script],
      sites: entry.sites.size,
      findings: entry.findings,
    }))
    .sort((left, right) => right.findings - left.findings || compareStrings(left.script, right.script));

  return {
    totals: { sitesWithFindings: sitesWithFindings.size, rules: tallies.size, elements },
    issues,
    byDetectedScript,
  };
}

/** Worst first, with `ungraded` last. Shared by both layers so the two orders agree. */
const SEVERITY_ORDER: Readonly<Record<Severity | 'ungraded', number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
  ungraded: 4,
};

function aggregateGroups(run: CampaignRun): GroupRow[] {
  return TARGET_GROUPS.map((group) => {
    const listed = run.sites.filter((site) => site.script === group);
    const scanned = listed.filter((site) => site.status === 'scanned');

    return {
      group,
      listed: listed.length,
      scanned: scanned.length,
      sitesWithScriptAwareFindings: scanned.filter(
        (site) => (site.scriptAware?.violations.length ?? 0) > 0,
      ).length,
      standardElements: scanned.reduce(
        (total, site) =>
          total + (site.standard?.violations ?? []).reduce((sum, v) => sum + v.nodes.length, 0),
        0,
      ),
      scriptAwareElements: scanned.reduce(
        (total, site) => total + (site.scriptAware?.violations.length ?? 0),
        0,
      ),
    };
  }).filter((row) => row.listed > 0);
}

/**
 * Sites whose pages carried none of the writing systems their group implies.
 *
 * Not an error and not a defect in the site: a homepage can be a language selector, or the entry
 * may simply be filed under the wrong group. It is reported because a campaign that counted such a
 * page as evidence about Thai typography would be publishing a number about nothing.
 */
function findLabelMismatches(sites: SiteRecord[]): LabelMismatch[] {
  const mismatches: LabelMismatch[] = [];

  for (const site of sites) {
    const detected = site.scriptsDetected ?? {};
    const expected = EXPECTED_SCRIPTS[site.script];
    const found = expected.some((script) => (detected[script] ?? 0) > 0);
    if (found) continue;

    mismatches.push({
      url: site.url,
      listedAs: site.script,
      detected: (Object.entries(detected) as [ScriptId, number][])
        .filter(([script, count]) => count > 0 && script !== 'common')
        .sort((left, right) => right[1] - left[1])
        .map(([script]) => script),
    });
  }

  return mismatches;
}

/** Aggregate one campaign. Same run in, same numbers out. */
export function aggregateCampaign(run: CampaignRun): CampaignAggregate {
  const scanned = scannedSites(run);
  const denominator = scanned.length;

  const standard = aggregateStandard(scanned, denominator);
  const scriptAware = aggregateScriptAware(scanned, denominator);

  const outcomes: Record<SiteStatus, number> = {
    scanned: 0,
    disallowed: 0,
    skipped: 0,
    failed: 0,
  };
  for (const site of run.sites) outcomes[site.status] += 1;

  return {
    targets: run.sites.length,
    outcomes,
    percentagesAreOutOf: denominator,
    layers: { standard: standard.totals, scriptAware: scriptAware.totals },
    issues: { standard: standard.issues, scriptAware: scriptAware.issues },
    byGroup: aggregateGroups(run),
    byDetectedScript: scriptAware.byDetectedScript,
    labelMismatches: findLabelMismatches(scanned),
  };
}
