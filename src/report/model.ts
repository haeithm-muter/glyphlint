/**
 * The shape every renderer reads.
 *
 * One pure function turns a `ScanResult` into a structure that is already counted, already
 * grouped and already sorted, so that the HTML, JSON and terminal renderers cannot disagree with
 * each other about what the scan found. A number that appears in two outputs is computed once,
 * here.
 *
 * The structure has two sections and no third one. There is no combined total anywhere in this
 * file, and adding one later would be the quiet beginning of claiming axe-core's findings as
 * ours — the two are counted separately, displayed separately, and summed never.
 */

import { RULES } from '../rules/index.js';
import { SCRIPT_LABELS } from '../rules/helpers.js';
import type {
  AxeViolation,
  Confidence,
  FilterReport,
  ScanError,
  ScanResult,
  ScriptId,
  Severity,
  UnsupportedScriptReport,
  Violation,
} from '../types.js';

/** Bumped when this structure changes shape, so a stored JSON report can be read knowingly. */
export const REPORT_VERSION = 1;

/** Worst first, the order a person reads a report in. Matches the sort in `runRules`. */
const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  critical: 0,
  serious: 1,
  moderate: 2,
  minor: 3,
};

export const SEVERITIES: readonly Severity[] = ['critical', 'serious', 'moderate', 'minor'];

/**
 * How many findings sit at each severity, plus the ones nobody graded.
 *
 * `ungraded` exists for axe: it leaves `impact` off when it did not grade a failure, and a report
 * that folded those into `minor` would be inventing a grade on axe's behalf.
 */
export interface SeverityCounts {
  critical: number;
  serious: number;
  moderate: number;
  minor: number;
  ungraded: number;
  total: number;
}

/** One axe-core rule, with axe's own text carried through untouched. */
export interface StandardGroup {
  /** The entry exactly as axe-core produced it. Nothing in this object is ours. */
  axe: AxeViolation;
  /** How many elements axe listed under this rule. */
  elementCount: number;
}

export interface StandardSection {
  source: 'axe-core';
  /** Rules with at least one failing element. */
  ruleCount: number;
  /** Failing elements across all rules. */
  elementCount: number;
  /** Checks axe ran that passed. axe's number, reported so its work is visible. */
  passes: number;
  counts: SeverityCounts;
  groups: StandardGroup[];
}

/** One GlyphLint rule, with the registry metadata a reader needs to weigh its findings. */
export interface ScriptAwareGroup {
  ruleId: string;
  title: string;
  /** The worst severity among these findings, which a rule may grade below its own declaration. */
  severity: Severity;
  confidence: Confidence;
  /** Rendered verbatim in every output. The sentence that says when not to believe the rule. */
  limitations: string;
  description: string;
  wcagRef?: string;
  /** The writing systems these findings are actually about, not the ones the rule could affect. */
  scripts: ScriptId[];
  violations: Violation[];
  elementCount: number;
}

export interface ScriptAwareSection {
  source: 'glyphlint';
  ruleCount: number;
  elementCount: number;
  counts: SeverityCounts;
  /** Findings per writing system. axe has no equivalent, which is the point of the whole tool. */
  byScript: { script: ScriptId; label: string; count: number }[];
  groups: ScriptAwareGroup[];
  /** True when any group is heuristic, so a renderer can say so once at the top. */
  hasHeuristicFindings: boolean;
}

export interface ReportModel {
  reportVersion: number;
  url: string;
  finalUrl: string;
  scannedAt: string;
  durationMs: number;
  standard: StandardSection;
  scriptAware: ScriptAwareSection;
  /** Text nodes per writing system across the whole page, whether or not anything was wrong. */
  scriptsDetected: { script: ScriptId; label: string; count: number }[];
  unsupportedScript?: UnsupportedScriptReport;
  filters?: FilterReport;
  error?: ScanError;
}

/**
 * The sentence that has to appear in every output GlyphLint produces.
 *
 * Kept here rather than in each renderer so that it cannot quietly differ between the HTML a site
 * owner reads and the JSON a pipeline stores.
 */
export const DISCLAIMER = [
  'This is an automated scan. It can report problems that are not real and it can miss problems',
  'that are. Findings are produced for education and for improving accessibility; none of them is',
  'an accusation, and none of them is a legal assessment. Anything marked heuristic is an',
  'inference from evidence that can be wrong. Verify a finding against the page before acting on',
  'it.',
].join(' ');

/** An empty tally, so every renderer sees the same keys whether or not anything was found. */
function emptyCounts(): SeverityCounts {
  return { critical: 0, serious: 0, moderate: 0, minor: 0, ungraded: 0, total: 0 };
}

function addSeverity(counts: SeverityCounts, severity: Severity | null): void {
  if (severity === null) counts.ungraded += 1;
  else counts[severity] += 1;
  counts.total += 1;
}

/** Worst grade among a group's findings; `null` when nothing in it was graded. */
function rankOf(severity: Severity | null): number {
  return severity === null ? SEVERITIES.length : SEVERITY_RANK[severity];
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Build the standard section.
 *
 * axe already groups by rule — one entry per rule, carrying every failing element — so nothing is
 * regrouped here. The entries are put in severity order for reading, and that is the only thing
 * this function does to them: the objects themselves are passed through by reference, so any
 * field axe carries that this project has never heard of survives into the JSON output.
 */
function buildStandardSection(violations: readonly AxeViolation[], passes: number): StandardSection {
  const counts = emptyCounts();
  const groups: StandardGroup[] = [];
  let elementCount = 0;

  for (const violation of violations) {
    // axe's `impact` is `ImpactValue | undefined`, where the value itself may be null. Both mean
    // ungraded, and neither is treated as a low grade.
    const impact = violation.impact ?? null;
    addSeverity(counts, impact);
    elementCount += violation.nodes.length;
    groups.push({ axe: violation, elementCount: violation.nodes.length });
  }

  groups.sort(
    (left, right) =>
      rankOf(left.axe.impact ?? null) - rankOf(right.axe.impact ?? null) ||
      compareStrings(left.axe.id, right.axe.id),
  );

  return {
    source: 'axe-core',
    ruleCount: groups.length,
    elementCount,
    passes,
    counts,
    groups,
  };
}

/**
 * The registry entry behind a finding.
 *
 * A miss is possible in one situation: rendering a report from a stored result produced by a
 * version of GlyphLint whose registry held a rule this one does not. The finding still has to be
 * shown — dropping it would be the report editing the scan — so what is missing is filled in from
 * the finding itself, and `limitations` stays empty rather than being invented.
 */
function metadataFor(ruleId: string, first: Violation): Omit<ScriptAwareGroup, 'violations'> {
  const rule = RULES.find((candidate) => candidate.id === ruleId);

  const group: Omit<ScriptAwareGroup, 'violations'> = {
    ruleId,
    title: rule?.title ?? first.title,
    severity: first.severity,
    confidence: first.confidence,
    limitations: rule?.limitations ?? '',
    description: rule?.description ?? '',
    scripts: [],
    elementCount: 0,
  };

  // The rule's citation is the one a reader can check. A finding carries its own only where the
  // rule decided the criterion genuinely applies to that case.
  const wcagRef = first.wcagRef ?? rule?.wcagRef;
  if (wcagRef !== undefined) group.wcagRef = wcagRef;

  return group;
}

function buildScriptAwareSection(violations: readonly Violation[]): ScriptAwareSection {
  const counts = emptyCounts();
  const scriptTally = new Map<ScriptId, number>();
  const byRule = new Map<string, Violation[]>();

  for (const violation of violations) {
    addSeverity(counts, violation.severity);
    scriptTally.set(violation.script, (scriptTally.get(violation.script) ?? 0) + 1);

    const existing = byRule.get(violation.ruleId);
    if (existing === undefined) byRule.set(violation.ruleId, [violation]);
    else existing.push(violation);
  }

  const groups: ScriptAwareGroup[] = [];

  for (const [ruleId, found] of byRule) {
    const first = found[0];
    if (first === undefined) continue;

    const group: ScriptAwareGroup = { ...metadataFor(ruleId, first), violations: found };
    group.elementCount = found.length;

    // The worst grade in the group, because a rule may grade one of its findings below its own
    // declared severity — see decision 012.
    for (const violation of found) {
      if (SEVERITY_RANK[violation.severity] < SEVERITY_RANK[group.severity]) {
        group.severity = violation.severity;
      }
    }

    group.scripts = [...new Set(found.map((violation) => violation.script))].sort(compareStrings);
    groups.push(group);
  }

  groups.sort(
    (left, right) =>
      SEVERITY_RANK[left.severity] - SEVERITY_RANK[right.severity] ||
      compareStrings(left.ruleId, right.ruleId),
  );

  return {
    source: 'glyphlint',
    ruleCount: groups.length,
    elementCount: violations.length,
    counts,
    byScript: tallyToList(scriptTally),
    groups,
    hasHeuristicFindings: groups.some((group) => group.confidence === 'heuristic'),
  };
}

/** A count map as a sorted list: most first, then by name, so two runs render identically. */
function tallyToList(
  tally: ReadonlyMap<ScriptId, number> | Partial<Record<ScriptId, number>>,
): { script: ScriptId; label: string; count: number }[] {
  const entries =
    tally instanceof Map
      ? [...tally.entries()]
      : (Object.entries(tally) as [ScriptId, number | undefined][]);

  return entries
    .filter((entry): entry is [ScriptId, number] => entry[1] !== undefined && entry[1] > 0)
    .map(([script, count]) => ({ script, label: SCRIPT_LABELS[script], count }))
    .sort((left, right) => right.count - left.count || compareStrings(left.script, right.script));
}

/** Turn one scan into the structure every renderer reads. Pure: same result in, same model out. */
export function buildReportModel(result: ScanResult): ReportModel {
  const model: ReportModel = {
    reportVersion: REPORT_VERSION,
    url: result.url,
    finalUrl: result.finalUrl,
    scannedAt: result.scannedAt,
    durationMs: result.durationMs,
    standard: buildStandardSection(result.standard.violations, result.standard.passes),
    scriptAware: buildScriptAwareSection(result.scriptAware.violations),
    scriptsDetected: tallyToList(result.scriptsDetected),
  };

  if (result.unsupportedScript !== undefined) model.unsupportedScript = result.unsupportedScript;
  if (result.filters !== undefined) model.filters = result.filters;
  if (result.error !== undefined) model.error = result.error;

  return model;
}
